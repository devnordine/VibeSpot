import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import { Spot } from "./models/Spot.js";
import { CustomList } from "./models/CustomList.js";
import mongoose from "mongoose";

// Les fichiers médias (photos des spots, fichiers audio) restent sur le disque.
const UPLOADS = path.resolve("data/uploads");

try {
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Clé secrète pour signer et vérifier les JWT
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// Taille maximale autorisée pour un fichier uploadé (25 Mo)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Types MIME acceptés : formats audio (TP) et formats images (VibeSpot)
const allowedMimeTypes = new Set([
  // Images (VibeSpot)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/gif",
  // Audio (TP legacy)
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Crée un jeton JWT contenant l'identité de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "7d",
  });
}

/**
 * Middleware Express qui protège les routes privées avec un JWT.
 */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    req.auth = jwt.verify(raw.slice(7), SECRET);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/**
 * Middleware d'authentification facultative :
 * injecte req.auth si un token valide est fourni, sans bloquer si absent.
 */
function optionalAuth(req, _res, next) {
  const raw = req.headers.authorization;
  if (raw?.startsWith("Bearer ")) {
    try {
      req.auth = jwt.verify(raw.slice(7), SECRET);
    } catch {
      // Ignorer si invalide en mode facultatif
    }
  }
  next();
}

/**
- Construit le filtre MongoDB garantissant qu'un utilisateur ne voit que :
- - les spots PUBLIC (ou sans champ visibility pour rétrocompatibilité),
- - ses propres spots,
- - les spots FRIENDS créés par ses amis,
- - les spots PRIVATE explicitement partagés avec lui (sharedWith).
 */
async function buildSpotAccessFilter(currentUserId) {
  const publicConditions = [
    { visibility: "PUBLIC" },
    { visibility: { $exists: false } },
  ];

  if (!currentUserId || !mongoose.isValidObjectId(currentUserId)) {
    return { $or: publicConditions };
  }

  const user = await User.findById(currentUserId).select("friends").lean();
  const friendIds = user?.friends || [];

  return {
    $or: [
      ...publicConditions,
      { createdBy: currentUserId },
      { visibility: "FRIENDS", createdBy: { $in: friendIds } },
      { visibility: "PRIVATE", sharedWith: currentUserId },
    ],
  };
}

/**
- Vérifie si un utilisateur donné a le droit de consulter un spot précis.
 */
async function canAccessSpot(spot, currentUserId) {
  const visibility = spot.visibility || "PUBLIC";
  if (visibility === "PUBLIC") return true;
  if (!currentUserId) return false;

  const userIdStr = String(currentUserId);
  if (String(spot.createdBy) === userIdStr) return true;

  if (visibility === "PRIVATE") {
    return (spot.sharedWith || []).some((id) => String(id) === userIdStr);
  }

  if (visibility === "FRIENDS") {
    const owner = await User.findById(spot.createdBy).select("friends").lean();
    return (owner?.friends || []).some((id) => String(id) === userIdStr);
  }

  return false;
}

/**
- Vérifie si un utilisateur est propriétaire ou collaborateur d'une liste.
 */
function canEditList(list, userId) {
  if (!userId) return false;
  const uid = String(userId);
  if (String(list.ownerId) === uid) return true;
  return (list.collaborators || []).some((c) => String(c._id || c) === uid);
}

// Configuration de Multer pour le stockage disque
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    callback(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      return callback(null, true);
    }
    const error = new Error("Format de fichier non accepté (images ou audio acceptés)");
    return callback(error);
  },
});

/**
 * Construit l'application Express pour VibeSpot.
 */
export function createApp() {
  const app = express();

  // Log de toutes les requêtes HTTP
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  app.use(cors());
  app.use(express.json());

  // Servir les uploads statiquement (photos des spots)
  app.use("/uploads", express.static(UPLOADS));

  
  // ROUTE HEALTHCHECK
  
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "VibeSpot API" });
  });

  
  // ROUTES AUTHENTIFICATION ET UTILISATEURS
  

  /**
   * Inscription d'un nouvel utilisateur.
   * Accepte : { name, email, password, tastes }
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password, tastes } = req.body || {};

      if (!name || !email || !password || password.length < 8) {
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      if (await User.exists({ email: String(email).toLowerCase() })) {
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      const user = await User.create({
        name,
        email,
        password,
        tastes: Array.isArray(tastes) ? tastes : [],
        badges: ["pionnier"],
      });

      console.log(`[auth] Nouvel utilisateur inscrit : ${user.id} (${user.email})`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Connexion avec email et mot de passe.
   */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const email = String(req.body?.email || "").toLowerCase();
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie pour ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Profil de l'utilisateur connecté.
   */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth.sub);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }
      res.json(user.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Mise à jour du profil utilisateur (nom, bio, avatar, goûts / humeurs préférées).
   */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const updates = {};
      if (req.body?.name) updates.name = req.body.name;
      if (req.body?.bio !== undefined) updates.bio = req.body.bio;
      if (req.body?.avatar !== undefined) updates.avatar = req.body.avatar;
      if (Array.isArray(req.body?.tastes)) updates.tastes = req.body.tastes;

      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: updates },
        { new: true, runValidators: true },
      );

      if (!user) {
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      res.json(user.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Récupère la liste des spots favoris de l'utilisateur connecté.
   */
  app.get("/api/users/me/favorites", auth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth.sub).populate("favorites");
      if (!user) {
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }
      const spots = (user.favorites || []).map((s) => (s.toPublic ? s.toPublic() : s));
      res.json(spots);
    } catch (error) {
      next(error);
    }
  });

  
  // ROUTES VIBESPOT : SPOTS (LIEUX PAR HUMEUR, CARTE, FILTRES, POPULAIRES)
  

  /**
   * Liste paginée des spots avec filtrage riche :
   * - mood : humeur (travail, calme, festif, gourmand, sportif, photo, etc.)
   * - category : restaurant, cafe, bar, parc, skatepark, coworking, etc.
   * - budget : 1, 2, 3
   * - search : recherche plein texte sur titre, description, ville, tags
   * - city : filtrer par ville
   * - lat, lng, maxDistance (en mètres) : filtrage géospatial par distance
   * - sort : popular (popularité), recent (plus récents), rating (meilleure note)
   */
  /**
- Liste paginée des spots avec filtrage riche et contrôle d'accès ACL.
   */
  app.get("/api/spots", optionalAuth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

      const accessFilter = await buildSpotAccessFilter(req.auth?.sub);
      const andConditions = [accessFilter];
      const filter = {};

      if (req.query.mood) filter.moods = req.query.mood;
      if (req.query.category) filter.category = req.query.category;
      if (req.query.budget) filter.budget = Number(req.query.budget);
      if (req.query.city) filter.city = new RegExp(String(req.query.city).trim(), "i");

      // Filtre optionnel de visibilité ("PUBLIC", "FRIENDS", "PRIVATE", "SHARED_WITH_ME")
      if (req.query.visibility) {
        const vis = String(req.query.visibility).toUpperCase();
        if (vis === "SHARED_WITH_ME" && req.auth?.sub) {
          filter.visibility = "PRIVATE";
          filter.sharedWith = req.auth.sub;
        } else if (["PUBLIC", "FRIENDS", "PRIVATE"].includes(vis)) {
          filter.visibility = vis;
        }
      }

      if (req.query.search) {
        const regex = new RegExp(String(req.query.search).trim(), "i");
        andConditions.push({
          $or: [
            { title: regex },
            { description: regex },
            { city: regex },
            { address: regex },
            { tags: regex },
          ],
        });
      }

      filter.$and = andConditions;

      if (req.query.lat && req.query.lng) {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const maxDist = Number(req.query.maxDistance) || 10000;

        if (!isNaN(lat) && !isNaN(lng)) {
          filter.location = {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [lng, lat],
              },
              $maxDistance: maxDist,
            },
          };
        }
      }

      let sort = { createdAt: -1 };
      if (req.query.sort === "popular") {
        sort = { ratingAverage: -1, favoritesCount: -1 };
      } else if (req.query.sort === "rating") {
        sort = { ratingAverage: -1 };
      } else if (req.query.sort === "recent") {
        sort = { createdAt: -1 };
      }

      const [items, total] = await Promise.all([
        Spot.find(filter)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit),
        Spot.countDocuments(filter),
      ]);

      res.json({
        items: items.map((spot) => spot.toPublic()),
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
- Données allégées pour la carte interactive (filtrées selon les droits ACL).
   */
  app.get("/api/spots/map", optionalAuth, async (req, res, next) => {
    try {
      const accessFilter = await buildSpotAccessFilter(req.auth?.sub);
      const filter = { $and: [accessFilter] };

      if (req.query.mood) filter.moods = req.query.mood;
      if (req.query.category) filter.category = req.query.category;
      if (req.query.city) filter.city = new RegExp(String(req.query.city).trim(), "i");

      const spots = await Spot.find(filter)
        .select(
          "title category moods budget address city location coverPhoto ratingAverage visibility",
        )
        .limit(200);

      const markers = spots.map((s) => ({
        id: String(s._id),
        title: s.title,
        category: s.category,
        moods: s.moods,
        budget: s.budget,
        address: s.address,
        city: s.city,
        longitude: s.location?.coordinates?.[0],
        latitude: s.location?.coordinates?.[1],
        coverPhoto: s.coverPhoto,
        ratingAverage: s.ratingAverage,
        visibility: s.visibility || "PUBLIC",
      }));

      res.json(markers);
    } catch (error) {
      next(error);
    }
  });

  /**
- Classement des spots les plus populaires / tendance (uniquement ceux accessibles).
   */
  app.get("/api/spots/trending", optionalAuth, async (req, res, next) => {
    try {
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
      const accessFilter = await buildSpotAccessFilter(req.auth?.sub);
      const spots = await Spot.find(accessFilter)
        .sort({ ratingAverage: -1, favoritesCount: -1 })
        .limit(limit);

      res.json(spots.map((s) => s.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
- Recommandations personnalisées selon les goûts de l'utilisateur (avec filtre ACL).
   */
  app.get("/api/spots/recommendations", optionalAuth, async (req, res, next) => {
    try {
      let moods = [];

      if (req.auth?.sub) {
        const user = await User.findById(req.auth.sub);
        if (user && user.tastes && user.tastes.length > 0) {
          moods = user.tastes;
        }
      }

      if (moods.length === 0 && req.query.moods) {
        moods = String(req.query.moods).split(",");
      }

      const accessFilter = await buildSpotAccessFilter(req.auth?.sub);
      const filter =
        moods.length > 0
          ? { $and: [accessFilter, { moods: { $in: moods } }] }
          : accessFilter;

      const spots = await Spot.find(filter)
        .sort({ ratingAverage: -1 })
        .limit(8);

      res.json(spots.map((s) => s.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
- Détails complets d'un spot avec vérification stricte d'accès (403 si privé non partagé).
   */
  app.get("/api/spots/:id", optionalAuth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de spot invalide" });
      }

      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      const allowed = await canAccessSpot(spot, req.auth?.sub);
      if (!allowed) {
        console.warn(
          `[acl] Accès refusé (403) au spot ${spot.id} pour l'utilisateur ${req.auth?.sub || "anonyme"}`,
        );
        return res.status(403).json({
          message: "Accès refusé : ce spot est privé ou réservé aux amis",
        });
      }

      res.json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Gestion granulaire du partage d'un spot (visibilité + ajout/révocation d'amis).
   */
  app.patch("/api/spots/:id/share", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de spot invalide" });
      }

      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      if (String(spot.createdBy) !== req.auth.sub) {
        return res.status(403).json({
          message: "Seul le créateur du spot peut modifier ses paramètres de partage",
        });
      }

      const { visibility, sharedWith, addUserId, removeUserId } = req.body || {};

      if (visibility !== undefined) {
        if (!["PUBLIC", "FRIENDS", "PRIVATE"].includes(visibility)) {
          return res.status(400).json({ message: "Visibilité invalide" });
        }
        spot.visibility = visibility;
      }

      const me = await User.findById(req.auth.sub).select("friends").lean();
      const myFriendIds = new Set((me?.friends || []).map((id) => String(id)));

      if (Array.isArray(sharedWith)) {
        for (const uid of sharedWith) {
          if (!mongoose.isValidObjectId(uid) || !myFriendIds.has(String(uid))) {
            return res.status(400).json({
              message: "Vous ne pouvez partager un spot privé qu'avec vos amis",
            });
          }
        }
        spot.sharedWith = [...new Set(sharedWith.map(String))];
      }

      if (addUserId) {
        if (!mongoose.isValidObjectId(addUserId) || !myFriendIds.has(String(addUserId))) {
          return res.status(400).json({
            message: "Cet utilisateur ne fait pas partie de votre liste d'amis",
          });
        }
        if (!spot.sharedWith.some((id) => String(id) === String(addUserId))) {
          spot.sharedWith.push(addUserId);
        }
        if (spot.visibility === "PUBLIC") {
          spot.visibility = "PRIVATE";
        }
      }

      if (removeUserId) {
        spot.sharedWith = spot.sharedWith.filter(
          (id) => String(id) !== String(removeUserId),
        );
      }

      if (spot.visibility === "PUBLIC") {
        spot.sharedWith = [];
      }

      await spot.save();
      console.log(
        `[share] Spot ${spot.id} mis à jour : visibility=${spot.visibility}, sharedWith=${spot.sharedWith.length}`,
      );
      res.json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Fil d'activité chronologique des amis (nouveaux spots accessibles, avis, listes).
   */
  app.get("/api/feed", auth, async (req, res, next) => {
    try {
      const me = await User.findById(req.auth.sub).select("friends").lean();
      const friendIds = me?.friends || [];

      if (friendIds.length === 0) {
        return res.json([]);
      }

      const accessFilter = await buildSpotAccessFilter(req.auth.sub);

      const [friendSpots, spotsWithFriendReviews, friendLists] = await Promise.all([
        Spot.find({
          createdBy: { $in: friendIds },
          $or: [
            { visibility: "PUBLIC" },
            { visibility: { $exists: false } },
            { visibility: "FRIENDS" },
            { visibility: "PRIVATE", sharedWith: req.auth.sub },
          ],
        })
          .populate("createdBy", "name avatar")
          .sort({ createdAt: -1 })
          .limit(15)
          .lean(),

        Spot.find({
          $and: [accessFilter, { "reviews.user": { $in: friendIds } }],
        })
          .select("title category coverPhoto visibility reviews")
          .populate("reviews.user", "name avatar")
          .sort({ updatedAt: -1 })
          .limit(15)
          .lean(),

        CustomList.find({
          ownerId: { $in: friendIds },
          $or: [{ isPublic: true }, { collaborators: req.auth.sub }],
        })
          .populate("ownerId", "name avatar")
          .sort({ createdAt: -1 })
          .limit(15)
          .lean(),
      ]);

      const friendIdSet = new Set(friendIds.map((id) => String(id)));
      const feedItems = [];

      for (const s of friendSpots) {
        if (!s.createdBy) continue;
        feedItems.push({
          id: `spot-${s._id}`,
          type: "NEW_SPOT",
          actor: {
            id: String(s.createdBy._id),
            name: s.createdBy.name,
            avatar: s.createdBy.avatar || "",
          },
          target: {
            id: String(s._id),
            title: s.title,
            category: s.category,
            coverPhoto: s.coverPhoto || "",
            visibility: s.visibility || "PUBLIC",
          },
          summary:
            s.visibility === "PRIVATE"
              ? `a partagé un spot privé avec vous : « ${s.title} »`
              : `a ajouté un nouveau spot : « ${s.title} »`,
          createdAt: s.createdAt,
        });
      }

      for (const s of spotsWithFriendReviews) {
        for (const r of s.reviews || []) {
          const reviewerId = String(r.user?._id || r.user);
          if (friendIdSet.has(reviewerId)) {
            feedItems.push({
              id: `review-${r._id}`,
              type: "NEW_REVIEW",
              actor: {
                id: reviewerId,
                name: r.user?.name || r.userName,
                avatar: r.user?.avatar || "",
              },
              target: {
                id: String(s._id),
                title: s.title,
                category: s.category,
                coverPhoto: s.coverPhoto || "",
                visibility: s.visibility || "PUBLIC",
              },
              summary: `a noté « ${s.title} » (${r.rating}/5)`,
              comment: r.comment || "",
              createdAt: r.createdAt || s.updatedAt,
            });
          }
        }
      }

      for (const l of friendLists) {
        if (!l.ownerId) continue;
        feedItems.push({
          id: `list-${l._id}`,
          type: "NEW_LIST",
          actor: {
            id: String(l.ownerId._id),
            name: l.ownerId.name,
            avatar: l.ownerId.avatar || "",
          },
          target: {
            id: String(l._id),
            title: l.name,
            spotsCount: (l.spots || []).length,
          },
          summary: `a créé la liste « ${l.name} »`,
          createdAt: l.createdAt,
        });
      }

      feedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(feedItems.slice(0, 30));
    } catch (error) {
      next(error);
    }
  });

  
  // INTERACTIONS SOCIALES : FAVORIS, AVIS & NOTES, AJOUT DE PHOTOS
  

  /**
   * Bascule l'état favori d'un spot pour l'utilisateur connecté (toggle).
   */
  app.post("/api/spots/:id/favorite", auth, async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      const user = await User.findById(req.auth.sub);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }

      const spotIdStr = String(spot._id);
      const isFav = user.favorites.some((f) => String(f) === spotIdStr);

      if (isFav) {
        // Retirer des favoris
        user.favorites = user.favorites.filter((f) => String(f) !== spotIdStr);
        spot.favoritesCount = Math.max(0, (spot.favoritesCount || 1) - 1);
      } else {
        // Ajouter aux favoris
        user.favorites.push(spot._id);
        spot.favoritesCount = (spot.favoritesCount || 0) + 1;
      }

      await Promise.all([user.save(), spot.save()]);

      res.json({
        favorited: !isFav,
        favoritesCount: spot.favoritesCount,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Ajoute une note et un commentaire sur un spot.
   * Met à jour la moyenne et attribue éventuellement le badge "foodie".
   */
  app.post("/api/spots/:id/reviews", auth, async (req, res, next) => {
    try {
      const { rating, comment, moodExperienced } = req.body || {};
      const numRating = Number(rating);

      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({ message: "Note entre 1 et 5 requise" });
      }

      const [spot, user] = await Promise.all([
        Spot.findById(req.params.id),
        User.findById(req.auth.sub),
      ]);

      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      // Ajouter l'avis
      spot.reviews.push({
        user: user._id,
        userName: user.name,
        rating: numRating,
        comment: comment || "",
        moodExperienced: moodExperienced || "",
      });

      // Recalcul de la moyenne
      const totalRatings = spot.reviews.reduce((acc, r) => acc + r.rating, 0);
      spot.ratingCount = spot.reviews.length;
      spot.ratingAverage = totalRatings / spot.reviews.length;

      // Débloquer le badge "foodie" si l'utilisateur note régulièrement des restos / cafés
      if (spot.category === "restaurant" || spot.category === "cafe") {
        if (user.awardBadge("foodie")) {
          await user.save();
          console.log(`[badge] Badge 'foodie' attribué à ${user.id}`);
        }
      }

      await spot.save();
      console.log(`[reviews] Avis ajouté sur le spot ${spot.id} par ${user.name}`);
      res.status(201).json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Supprime un avis déposé par l'utilisateur connecté sur un spot.
   */
  app.delete("/api/spots/:id/reviews/:reviewId", auth, async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      const review = spot.reviews.id(req.params.reviewId);
      if (!review) {
        return res.status(404).json({ message: "Avis introuvable" });
      }

      if (String(review.user) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur cet avis" });
      }

      review.deleteOne();

      if (spot.reviews.length > 0) {
        const total = spot.reviews.reduce((acc, r) => acc + r.rating, 0);
        spot.ratingCount = spot.reviews.length;
        spot.ratingAverage = total / spot.reviews.length;
      } else {
        spot.ratingCount = 0;
        spot.ratingAverage = 0;
      }

      await spot.save();
      res.json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Ajoute une nouvelle photo à un spot.
   * Attribue le badge "photographe" à l'utilisateur.
   */
  app.post(
    "/api/spots/:id/photos",
    auth,
    upload.single("photo"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Fichier photo requis" });
        }

        const spot = await Spot.findById(req.params.id);
        if (!spot) {
          return res.status(404).json({ message: "Spot introuvable" });
        }

        const photoUrl = `/uploads/${req.file.filename}`;
        spot.photos.push({
          url: photoUrl,
          storedName: req.file.filename,
          originalName: req.file.originalname,
          caption: req.body?.caption || "",
          uploadedBy: req.auth.sub,
        });

        if (!spot.coverPhoto) {
          spot.coverPhoto = photoUrl;
        }

        // Débloquer le badge "photographe"
        const user = await User.findById(req.auth.sub);
        if (user && user.awardBadge("photographe")) {
          await user.save();
          console.log(`[badge] Badge 'photographe' attribué à ${user.id}`);
        }

        await spot.save();
        res.status(201).json(spot.toPublic());
      } catch (error) {
        next(error);
      }
    },
  );


  // ROUTES LISTES PERSONNALISÉES & COLLABORATIVES


  /**
- Récupère les listes dont l'utilisateur est propriétaire ou collaborateur.
   */
  app.get("/api/lists", auth, async (req, res, next) => {
    try {
      const lists = await CustomList.find({
        $or: [{ ownerId: req.auth.sub }, { collaborators: req.auth.sub }],
      })
        .populate("spots")
        .populate("collaborators", "name email avatar")
        .sort({ updatedAt: -1 });

      res.json(lists.map((l) => l.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
- Crée une nouvelle liste personnalisée (avec collaborateurs optionnels).
   */
  app.post("/api/lists", auth, async (req, res, next) => {
    try {
      const { name, description, isPublic, collaborators } = req.body || {};
      if (!name) {
        return res.status(400).json({ message: "Nom de liste requis" });
      }

      const validCollaborators = Array.isArray(collaborators)
        ? collaborators.filter((id) => mongoose.isValidObjectId(id))
        : [];

      const list = await CustomList.create({
        name,
        description: description || "",
        isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
        ownerId: req.auth.sub,
        collaborators: [...new Set(validCollaborators)],
        spots: [],
      });

      await list.populate("collaborators", "name email avatar");
      res.status(201).json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Détails d'une liste avec vérification de visibilité.
   */
  app.get("/api/lists/:id", optionalAuth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de liste invalide" });
      }

      const list = await CustomList.findById(req.params.id)
        .populate("spots")
        .populate("collaborators", "name email avatar");

      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (!list.isPublic && !canEditList(list, req.auth?.sub)) {
        return res.status(403).json({ message: "Accès refusé à cette liste privée" });
      }

      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Met à jour les métadonnées et collaborateurs d'une liste (réservé au propriétaire).
   */
  app.put("/api/lists/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de liste invalide" });
      }

      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (String(list.ownerId) !== req.auth.sub) {
        return res.status(403).json({
          message: "Seul le propriétaire peut modifier les paramètres de la liste",
        });
      }

      const { name, description, isPublic, collaborators } = req.body || {};
      if (name !== undefined && String(name).trim()) list.name = String(name).trim();
      if (description !== undefined) list.description = String(description);
      if (isPublic !== undefined) list.isPublic = Boolean(isPublic);

      if (Array.isArray(collaborators)) {
        const me = await User.findById(req.auth.sub).select("friends").lean();
        const myFriendIds = new Set((me?.friends || []).map((id) => String(id)));

        for (const cid of collaborators) {
          if (!mongoose.isValidObjectId(cid) || !myFriendIds.has(String(cid))) {
            return res.status(400).json({
              message: "Les collaborateurs doivent faire partie de votre liste d'amis",
            });
          }
        }
        list.collaborators = [...new Set(collaborators.map(String))];
      }

      await list.save();
      await list.populate(["spots", { path: "collaborators", select: "name email avatar" }]);
      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Réordonne les spots d'une liste (Drag & Drop) — propriétaire ou collaborateur.
   */
  app.put("/api/lists/:id/reorder", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de liste invalide" });
      }

      const { spotIds } = req.body || {};
      if (!Array.isArray(spotIds)) {
        return res.status(400).json({ message: "Tableau spotIds requis" });
      }

      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (!canEditList(list, req.auth.sub)) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      const currentIds = new Set(list.spots.map((s) => String(s)));
      if (
        spotIds.length !== currentIds.size ||
        spotIds.some((id) => !currentIds.has(String(id)))
      ) {
        return res.status(400).json({
          message: "La liste réordonnée doit contenir exactement les mêmes spots",
        });
      }

      list.spots = spotIds;
      await list.save();
      await list.populate(["spots", { path: "collaborators", select: "name email avatar" }]);

      console.log(`[lists] Liste ${list.id} réordonnée par ${req.auth.sub}`);
      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Ajoute un spot à une liste (propriétaire ou collaborateur).
   */
  app.post("/api/lists/:id/spots/:spotId", auth, async (req, res, next) => {
    try {
      if (
        !mongoose.isValidObjectId(req.params.id) ||
        !mongoose.isValidObjectId(req.params.spotId)
      ) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }

      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (!canEditList(list, req.auth.sub)) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      if (!list.spots.some((s) => String(s) === req.params.spotId)) {
        list.spots.push(req.params.spotId);
        await list.save();
      }

      await list.populate(["spots", { path: "collaborators", select: "name email avatar" }]);
      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Retire un spot d'une liste (propriétaire ou collaborateur).
   */
  app.delete("/api/lists/:id/spots/:spotId", auth, async (req, res, next) => {
    try {
      if (
        !mongoose.isValidObjectId(req.params.id) ||
        !mongoose.isValidObjectId(req.params.spotId)
      ) {
        return res.status(400).json({ message: "Identifiant invalide" });
      }

      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (!canEditList(list, req.auth.sub)) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      list.spots = list.spots.filter((s) => String(s) !== req.params.spotId);
      await list.save();

      await list.populate(["spots", { path: "collaborators", select: "name email avatar" }]);
      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
- Supprime une liste personnalisée (réservé au propriétaire).
   */
  app.delete("/api/lists/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de liste invalide" });
      }

      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (String(list.ownerId) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      await CustomList.findByIdAndDelete(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  
  // COMPATIBILITÉ TRACKS (TP BACKEND HISTORIQUE)
  
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const filter = { ownerId: req.auth.sub };

      const [items, total] = await Promise.all([
        Track.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select("-storedName")
          .lean(),
        Track.countDocuments(filter),
      ]);

      const publicItems = items.map((track) => ({
        ...track,
        id: String(track._id),
        _id: undefined,
      }));

      res.json({
        items: publicItems,
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || req.file.originalname,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });

        res.status(201).json(track.toPublic());
      } catch (error) {
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
          } catch {}
        }
        next(error);
      }
    },
  );

  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      res.sendFile(audioPath, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
      } catch {}

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // =========================================================================
  // ROUTES RÉSEAU SOCIAL : RECHERCHE D'UTILISATEURS & GESTION DES AMIS
  // =========================================================================

  /**
- Recherche d'utilisateurs par nom ou email avec statut relationnel.
   */
  app.get("/api/users/search", auth, async (req, res, next) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) {
        return res.json([]);
      }

      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      const [me, users] = await Promise.all([
        User.findById(req.auth.sub).select("friends friendRequests").lean(),
        User.find({
          _id: { $ne: req.auth.sub },
          $or: [{ name: regex }, { email: regex }],
        })
          .select("name email avatar bio badges friendRequests")
          .limit(20)
          .lean(),
      ]);

      const myFriendSet = new Set((me?.friends || []).map((id) => String(id)));
      const incomingMap = new Map();
      for (const r of me?.friendRequests || []) {
        if (r.status === "PENDING") {
          incomingMap.set(String(r.from), String(r._id));
        }
      }

      const results = users.map((u) => {
        const uid = String(u._id);
        let relationStatus = "NONE";
        let requestId = null;

        if (myFriendSet.has(uid)) {
          relationStatus = "FRIEND";
        } else if (incomingMap.has(uid)) {
          relationStatus = "PENDING_RECEIVED";
          requestId = incomingMap.get(uid);
        } else if (
          (u.friendRequests || []).some(
            (r) => String(r.from) === req.auth.sub && r.status === "PENDING",
          )
        ) {
          relationStatus = "PENDING_SENT";
        }

        return {
          id: uid,
          name: u.name,
          email: u.email,
          avatar: u.avatar || "",
          bio: u.bio || "",
          badges: u.badges || ["pionnier"],
          relationStatus,
          ...(requestId ? { requestId } : {}),
        };
      });

      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  /**
- Récupère la liste des amis acceptés, les demandes reçues et les demandes envoyées.
   */
  app.get("/api/friends", auth, async (req, res, next) => {
    try {
      const [me, outgoingUsers] = await Promise.all([
        User.findById(req.auth.sub)
          .populate("friends", "name email avatar bio badges")
          .populate("friendRequests.from", "name email avatar bio badges"),
        User.find({
          friendRequests: {
            $elemMatch: { from: req.auth.sub, status: "PENDING" },
          },
        })
          .select("name email avatar bio badges")
          .lean(),
      ]);

      if (!me) {
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      const friends = (me.friends || []).map((f) => ({
        id: String(f._id),
        name: f.name,
        email: f.email,
        avatar: f.avatar || "",
        bio: f.bio || "",
        badges: f.badges || ["pionnier"],
      }));

      const incomingRequests = (me.friendRequests || [])
        .filter((r) => r.status === "PENDING" && r.from)
        .map((r) => ({
          id: String(r._id),
          from: {
            id: String(r.from._id),
            name: r.from.name,
            email: r.from.email,
            avatar: r.from.avatar || "",
            badges: r.from.badges || ["pionnier"],
          },
          status: r.status,
          createdAt: r.createdAt,
        }));

      const outgoingRequests = outgoingUsers.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        avatar: u.avatar || "",
      }));

      res.json({ friends, incomingRequests, outgoingRequests });
    } catch (error) {
      next(error);
    }
  });

  /**
- Envoie une invitation d'ami à un utilisateur cible.
   */
  app.post("/api/friends/request/:userId", auth, async (req, res, next) => {
    try {
      const targetId = req.params.userId;
      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ message: "Identifiant utilisateur invalide" });
      }

      if (targetId === req.auth.sub) {
        return res.status(400).json({ message: "Impossible de s'ajouter soi-même en ami" });
      }

      const [me, target] = await Promise.all([
        User.findById(req.auth.sub),
        User.findById(targetId),
      ]);

      if (!me || !target) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }

      if (me.friends.some((id) => String(id) === targetId)) {
        return res.status(409).json({ message: "Vous êtes déjà amis" });
      }

      const alreadySent = target.friendRequests.some(
        (r) => String(r.from) === req.auth.sub && r.status === "PENDING",
      );
      if (alreadySent) {
        return res.status(409).json({ message: "Invitation déjà envoyée" });
      }

      const alreadyReceived = me.friendRequests.some(
        (r) => String(r.from) === targetId && r.status === "PENDING",
      );
      if (alreadyReceived) {
        return res.status(409).json({
          message: "Cet utilisateur vous a déjà envoyé une invitation",
        });
      }

      target.friendRequests.push({ from: req.auth.sub, status: "PENDING" });
      await target.save();

      console.log(`[friends] Invitation envoyée de ${req.auth.sub} vers ${targetId}`);
      res.status(201).json({
        message: "Invitation envoyée",
        targetUserId: targetId,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
- Accepte ou refuse une demande d'ami reçue.
   */
  app.patch("/api/friends/respond/:requestId", auth, async (req, res, next) => {
    try {
      const { requestId } = req.params;
      if (!mongoose.isValidObjectId(requestId)) {
        return res.status(400).json({ message: "Identifiant d'invitation invalide" });
      }

      const rawAction = String(req.body?.action || req.body?.status || "").toUpperCase();
      if (!["ACCEPT", "ACCEPTED", "REJECT", "REJECTED"].includes(rawAction)) {
        return res.status(400).json({ message: "Action invalide (ACCEPT ou REJECT requis)" });
      }

      const isAccepted = rawAction === "ACCEPT" || rawAction === "ACCEPTED";
      const me = await User.findById(req.auth.sub);
      if (!me) {
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      const request = me.friendRequests.id(requestId);
      if (!request) {
        return res.status(404).json({ message: "Invitation introuvable" });
      }

      if (request.status !== "PENDING") {
        return res.status(400).json({ message: "Cette invitation a déjà été traitée" });
      }

      request.status = isAccepted ? "ACCEPTED" : "REJECTED";

      if (isAccepted) {
        const senderId = String(request.from);
        if (!me.friends.some((id) => String(id) === senderId)) {
          me.friends.push(request.from);
        }
        await User.findByIdAndUpdate(senderId, {
          $addToSet: { friends: me._id },
        });
      }

      await me.save();
      console.log(`[friends] Invitation ${requestId} -> ${request.status} par ${req.auth.sub}`);
      res.json({
        message: isAccepted ? "Invitation acceptée" : "Invitation refusée",
        status: request.status,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
- Supprime un ami et purge automatiquement tous les partages privés (sharedWith)
- ainsi que les accès collaboratifs aux listes dans les deux sens.
   */
  app.delete("/api/friends/:friendId", auth, async (req, res, next) => {
    try {
      const { friendId } = req.params;
      if (!mongoose.isValidObjectId(friendId)) {
        return res.status(400).json({ message: "Identifiant ami invalide" });
      }

      const myId = req.auth.sub;
      const friendExists = await User.exists({ _id: friendId });
      if (!friendExists) {
        return res.status(404).json({ message: "Utilisateur introuvable" });
      }

      const [, , spotsPurgeMine, spotsPurgeTheirs] = await Promise.all([
        User.findByIdAndUpdate(myId, {
          $pull: {
            friends: friendId,
            friendRequests: { from: friendId },
          },
        }),
        User.findByIdAndUpdate(friendId, {
          $pull: {
            friends: myId,
            friendRequests: { from: myId },
          },
        }),
        Spot.updateMany(
          { createdBy: myId, sharedWith: friendId },
          { $pull: { sharedWith: friendId } },
        ),
        Spot.updateMany(
          { createdBy: friendId, sharedWith: myId },
          { $pull: { sharedWith: myId } },
        ),
        CustomList.updateMany(
          { ownerId: myId, collaborators: friendId },
          { $pull: { collaborators: friendId } },
        ),
        CustomList.updateMany(
          { ownerId: friendId, collaborators: myId },
          { $pull: { collaborators: myId } },
        ),
      ]);

      const revokedSpotsCount =
        (spotsPurgeMine.modifiedCount || 0) + (spotsPurgeTheirs.modifiedCount || 0);

      console.log(
        `[friends] Amitié supprimée (${myId} <-> ${friendId}), ${revokedSpotsCount} spot(s) purgés`,
      );
      res.json({
        message: "Ami retiré et partages privés révoqués",
        revokedSpotsCount,
      });
    } catch (error) {
      next(error);
    }
  });

  
  // GESTIONNAIRE D'ERREURS CENTRAL
  
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur traitée :", error);

    if (error instanceof multer.MulterError || error?.message?.includes("Format de fichier non accepté")) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    res.status(500).json({ message: "Erreur interne du serveur" });
  });

  return app;
}
