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

  // =========================================================================
  // ROUTE HEALTHCHECK
  // =========================================================================
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "VibeSpot API" });
  });

  // =========================================================================
  // ROUTES AUTHENTIFICATION ET UTILISATEURS
  // =========================================================================

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

  // =========================================================================
  // ROUTES VIBESPOT : SPOTS (LIEUX PAR HUMEUR, CARTE, FILTRES, POPULAIRES)
  // =========================================================================

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
  app.get("/api/spots", async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

      const filter = {};

      // Filtrer par humeur / mood
      if (req.query.mood) {
        filter.moods = req.query.mood;
      }

      // Filtrer par catégorie
      if (req.query.category) {
        filter.category = req.query.category;
      }

      // Filtrer par budget
      if (req.query.budget) {
        filter.budget = Number(req.query.budget);
      }

      // Filtrer par ville
      if (req.query.city) {
        filter.city = new RegExp(String(req.query.city).trim(), "i");
      }

      // Recherche textuelle
      if (req.query.search) {
        const regex = new RegExp(String(req.query.search).trim(), "i");
        filter.$or = [
          { title: regex },
          { description: regex },
          { city: regex },
          { address: regex },
          { tags: regex },
        ];
      }

      // Filtrage par distance géospatiale si lat et lng sont fournies
      if (req.query.lat && req.query.lng) {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const maxDist = Number(req.query.maxDistance) || 10000; // 10 km par défaut

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

      // Définir le tri
      let sort = { createdAt: -1 };
      if (req.query.sort === "popular") {
        sort = { ratingAverage: -1, favoritesCount: -1 };
      } else if (req.query.sort === "rating") {
        sort = { ratingAverage: -1 };
      } else if (req.query.sort === "recent") {
        sort = { createdAt: -1 };
      }

      // Requêtes parallèles pour items et total
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
   * Données allégées pour la carte interactive (markers).
   * Retourne tous les spots ou filtrés par ville / humeur avec coordonnées.
   */
  app.get("/api/spots/map", async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.mood) filter.moods = req.query.mood;
      if (req.query.category) filter.category = req.query.category;
      if (req.query.city) filter.city = new RegExp(String(req.query.city).trim(), "i");

      const spots = await Spot.find(filter)
        .select("title category moods budget address city location coverPhoto ratingAverage")
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
      }));

      res.json(markers);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Classement des spots les plus populaires / tendance.
   */
  app.get("/api/spots/trending", async (req, res, next) => {
    try {
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 6));
      const spots = await Spot.find()
        .sort({ ratingAverage: -1, favoritesCount: -1 })
        .limit(limit);

      res.json(spots.map((s) => s.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Recommandations personnalisées selon les goûts de l'utilisateur.
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

      // Si pas de goûts renseignés, prendre les humeurs passées en query param
      if (moods.length === 0 && req.query.moods) {
        moods = String(req.query.moods).split(",");
      }

      const filter = moods.length > 0 ? { moods: { $in: moods } } : {};
      const spots = await Spot.find(filter)
        .sort({ ratingAverage: -1 })
        .limit(8);

      res.json(spots.map((s) => s.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Détails complets d'un spot par son identifiant.
   */
  app.get("/api/spots/:id", async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }
      res.json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Création d'un nouveau spot par un utilisateur authentifié.
   * Prend en charge les requêtes multipart (avec upload de photo de couverture) ou JSON standard.
   */
  app.post(
    "/api/spots",
    auth,
    upload.single("photo"),
    async (req, res, next) => {
      try {
        const {
          title,
          description,
          category,
          moods,
          budget,
          address,
          city,
          postalCode,
          latitude,
          longitude,
          tags,
        } = req.body || {};

        if (!title || !category) {
          return res.status(400).json({ message: "Titre et catégorie requis" });
        }

        // Formatage des humeurs
        let parsedMoods = [];
        if (Array.isArray(moods)) {
          parsedMoods = moods;
        } else if (typeof moods === "string") {
          try {
            parsedMoods = JSON.parse(moods);
          } catch {
            parsedMoods = moods.split(",").map((m) => m.trim()).filter(Boolean);
          }
        }

        // Formatage des coordonnées
        const lat = Number(latitude) || 43.7102;
        const lng = Number(longitude) || 7.262;

        let coverPhoto = "";
        const photos = [];

        if (req.file) {
          const photoUrl = `/uploads/${req.file.filename}`;
          coverPhoto = photoUrl;
          photos.push({
            url: photoUrl,
            storedName: req.file.filename,
            originalName: req.file.originalname,
            uploadedBy: req.auth.sub,
          });
        } else if (req.body?.coverPhoto) {
          coverPhoto = req.body.coverPhoto;
        }

        const spot = await Spot.create({
          title,
          description: description || "",
          category,
          moods: parsedMoods,
          budget: Number(budget) || 1,
          address: address || "",
          city: city || "Nice",
          postalCode: postalCode || "",
          location: {
            type: "Point",
            coordinates: [lng, lat],
          },
          coverPhoto,
          photos,
          createdBy: req.auth.sub,
          tags: Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [],
        });

        // Débloquer le badge "explorateur" pour l'utilisateur s'il crée son premier spot
        const user = await User.findById(req.auth.sub);
        if (user && user.awardBadge("explorateur")) {
          await user.save();
          console.log(`[badge] Badge 'explorateur' attribué à ${user.id}`);
        }

        console.log(`[spots] Spot créé avec succès : ${spot.id} (${spot.title})`);
        res.status(201).json(spot.toPublic());
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Modification d'un spot existant (réservé à son créateur).
   */
  app.put("/api/spots/:id", auth, async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      if (String(spot.createdBy) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur ce spot" });
      }

      const { title, description, category, moods, budget, address, city } = req.body || {};
      if (title) spot.title = title;
      if (description !== undefined) spot.description = description;
      if (category) spot.category = category;
      if (Array.isArray(moods)) spot.moods = moods;
      if (budget) spot.budget = Number(budget);
      if (address !== undefined) spot.address = address;
      if (city !== undefined) spot.city = city;

      await spot.save();
      res.json(spot.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Suppression d'un spot (réservé à son créateur).
   */
  app.delete("/api/spots/:id", auth, async (req, res, next) => {
    try {
      const spot = await Spot.findById(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Spot introuvable" });
      }

      if (String(spot.createdBy) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur ce spot" });
      }

      await Spot.findByIdAndDelete(req.params.id);
      console.log(`[spots] Spot supprimé : ${req.params.id}`);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // =========================================================================
  // INTERACTIONS SOCIALES : FAVORIS, AVIS & NOTES, AJOUT DE PHOTOS
  // =========================================================================

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

  // =========================================================================
  // ROUTES LISTES PERSONNALISÉES
  // =========================================================================

  /**
   * Récupère les listes de l'utilisateur connecté.
   */
  app.get("/api/lists", auth, async (req, res, next) => {
    try {
      const lists = await CustomList.find({ ownerId: req.auth.sub })
        .populate("spots")
        .sort({ updatedAt: -1 });

      res.json(lists.map((l) => l.toPublic()));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Crée une nouvelle liste personnalisée (ex: "Mes spots révisions").
   */
  app.post("/api/lists", auth, async (req, res, next) => {
    try {
      const { name, description, isPublic } = req.body || {};
      if (!name) {
        return res.status(400).json({ message: "Nom de liste requis" });
      }

      const list = await CustomList.create({
        name,
        description: description || "",
        isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
        ownerId: req.auth.sub,
        spots: [],
      });

      res.status(201).json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Détails d'une liste avec les spots qu'elle contient.
   */
  app.get("/api/lists/:id", async (req, res, next) => {
    try {
      const list = await CustomList.findById(req.params.id).populate("spots");
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }
      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Ajoute un spot à une liste personnalisée.
   */
  app.post("/api/lists/:id/spots/:spotId", auth, async (req, res, next) => {
    try {
      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (String(list.ownerId) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      if (!list.spots.includes(req.params.spotId)) {
        list.spots.push(req.params.spotId);
        await list.save();
      }

      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Retire un spot d'une liste personnalisée.
   */
  app.delete("/api/lists/:id/spots/:spotId", auth, async (req, res, next) => {
    try {
      const list = await CustomList.findById(req.params.id);
      if (!list) {
        return res.status(404).json({ message: "Liste introuvable" });
      }

      if (String(list.ownerId) !== req.auth.sub) {
        return res.status(403).json({ message: "Action non autorisée sur cette liste" });
      }

      list.spots = list.spots.filter((s) => String(s) !== req.params.spotId);
      await list.save();

      res.json(list.toPublic());
    } catch (error) {
      next(error);
    }
  });

  /**
   * Supprime une liste personnalisée.
   */
  app.delete("/api/lists/:id", auth, async (req, res, next) => {
    try {
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

  // =========================================================================
  // COMPATIBILITÉ TRACKS (TP BACKEND HISTORIQUE)
  // =========================================================================
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
  // GESTIONNAIRE D'ERREURS CENTRAL
  // =========================================================================
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
