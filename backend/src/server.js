import mongoose from "mongoose";
import { createApp } from "./app.js";
import { User } from "./models/User.js";

import { Spot } from "./models/Spot.js";

// Le port et l'URI viennent de l'environnement du backend, jamais d'Angular.
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  const error = new Error("MONGODB_URI manque dans backend/.env");
  console.error("[startup] Configuration MongoDB absente", error);
  throw error;
}

try {
  // `await` suspend le démarrage jusqu'à la connexion effective à MongoDB.
  // Le `then` rend le succès visible dans les logs.
  await mongoose.connect(uri).then(() => {
    console.log("[startup] Connecté à MongoDB Atlas");
    console.log(
      "[startup] La base vibeSpot_db est prête à recevoir des données",
    );
    console.log(`[startup] Vérification : http://localhost:${port}/api/health`);
  });
} catch (error) {
  // Ne pas démarrer une API qui ne peut pas accéder à sa base de données.
  console.error("[startup] Échec de connexion à MongoDB", error);
  throw error;
}

try {
  // Le compte de démonstration facilite les premiers tests des étudiants.
  const demoEmail = "demo@example.com";
  let demoUser = await User.findOne({ email: demoEmail });

  if (!demoUser) {
    demoUser = await User.create({
      name: "Alex Vibe",
      email: demoEmail,
      password: "Demo1234!",
      bio: "Amateur de cafés calmes pour coder et de rooftop au coucher de soleil.",
      tastes: ["travail", "calme", "photo"],
      badges: ["pionnier", "explorateur"],
    });
    console.log(`[startup] Compte de démonstration créé : ${demoUser.id}`);
  } else {
    console.log("[startup] Compte de démonstration déjà présent");
  }

  // Initialisation de quelques spots de démonstration si la base est vide
  const spotsCount = await Spot.countDocuments();
  if (spotsCount === 0) {
    console.log("[startup] Initialisation de spots de démonstration VibeSpot...");
    await Spot.create([
      {
        title: "Café Koohi & Cowork",
        description:
          "Grand café lumineux, wifi ultra rapide, prises partout et ambiance studieuse.",
        category: "cafe",
        moods: ["travail", "calme"],
        budget: 1,
        address: "12 Rue de France",
        city: "Nice",
        postalCode: "06000",
        location: { type: "Point", coordinates: [7.2612, 43.6974] },
        coverPhoto:
          "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800",
        createdBy: demoUser._id,
        ratingAverage: 4.8,
        ratingCount: 12,
        favoritesCount: 24,
        affluence: "moderee",
        tags: ["wifi", "prises", "specialty coffee"],
      },
      {
        title: "Belvédère de la Colline du Château",
        description:
          "Vue panoramique imprenable sur la Baie des Anges. Le meilleur spot photo pour le coucher de soleil.",
        category: "parc",
        moods: ["photo", "romantique", "calme", "nature"],
        budget: 1,
        address: "Montée Lesage",
        city: "Nice",
        postalCode: "06300",
        location: { type: "Point", coordinates: [7.2798, 43.6953] },
        coverPhoto:
          "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800",
        createdBy: demoUser._id,
        ratingAverage: 4.9,
        ratingCount: 35,
        favoritesCount: 52,
        affluence: "elevee",
        tags: ["coucher de soleil", "panorama", "vue mer"],
      },
      {
        title: "Roller & Skatepark Jean Bouin",
        description:
          "Bowl et street park en accès libre, ambiance sportive et conviviale.",
        category: "skatepark",
        moods: ["sportif", "festif"],
        budget: 1,
        address: "Esplanade Jean Bouin",
        city: "Nice",
        postalCode: "06300",
        location: { type: "Point", coordinates: [7.2845, 43.7061] },
        coverPhoto:
          "https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?w=800",
        createdBy: demoUser._id,
        ratingAverage: 4.6,
        ratingCount: 18,
        favoritesCount: 15,
        affluence: "moderee",
        tags: ["skate", "roller", "plein air"],
      },
      {
        title: "Bao Bar Rooftop",
        description:
          "Cocktails créatifs, tapas asiatiques et DJ set en soirée le week-end.",
        category: "bar",
        moods: ["festif", "gourmand"],
        budget: 2,
        address: "5 Rue Bonaparte",
        city: "Nice",
        postalCode: "06300",
        location: { type: "Point", coordinates: [7.281, 43.7001] },
        coverPhoto:
          "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800",
        createdBy: demoUser._id,
        ratingAverage: 4.7,
        ratingCount: 22,
        favoritesCount: 38,
        affluence: "elevee",
        tags: ["cocktails", "dj", "terrasse"],
      },
      {
        title: "Bibliothèque Louis Nucéra",
        description:
          "Espace silencieux idéal pour concentration maximale, vaste collection et coin lecture.",
        category: "bibliotheque",
        moods: ["calme", "travail", "lieu_culturel"],
        budget: 1,
        address: "2 Place Yves Klein",
        city: "Nice",
        postalCode: "06300",
        location: { type: "Point", coordinates: [7.2785, 43.7018] },
        coverPhoto:
          "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800",
        createdBy: demoUser._id,
        ratingAverage: 4.5,
        ratingCount: 8,
        favoritesCount: 11,
        affluence: "faible",
        tags: ["silence", "livres", "etude"],
      },
    ]);
    console.log("[startup] 5 spots de démonstration créés avec succès !");
  }
} catch (error) {
  console.error("[startup] Erreur d'initialisation des données", error);
  throw error;
}

const server = createApp().listen(port, () => {
  console.log(`VibeSpot API: http://localhost:${port}/api/health`);
});

// Le callback `error` couvre notamment un port déjà utilisé.
server.on("error", (error) => {
  console.error(`[startup] Impossible d'écouter sur le port ${port}`, error);
});
