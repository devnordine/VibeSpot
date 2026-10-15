import mongoose from "mongoose";

/*
 * Schéma d'un avis / commentaire sur un spot.
 * Contient la note de 1 à 5, un commentaire textuel et l'humeur ressentie.
 */
const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "" },
    moodExperienced: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

/*
 * Schéma d'une photo d'un spot.
 * L'image elle-même est stockée sur le disque serveur, ce schéma conserve ses métadonnées.
 */
const photoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    storedName: { type: String, select: false },
    originalName: { type: String },
    caption: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

/*
 * Schéma principal d'un Spot pour l'application VibeSpot.
 * Comprend coordonnées géographiques (GeoJSON), catégories, humeurs (moods),
 * budget, photos, notes, favoris et affluence.
 */
const spotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    category: {
      type: String,
      required: true,
      enum: [
        "restaurant",
        "cafe",
        "bar",
        "parc",
        "skatepark",
        "salle_concert",
        "bibliotheque",
        "coworking",
        "lieu_culturel",
        "terrain_sport",
        "autre",
      ],
      index: true,
    },
    // Humeurs associées au lieu (ex: travail, calme, festif, gourmand, sportif, photo, romantique)
    moods: {
      type: [String],
      default: [],
      index: true,
    },
    // Échelle de budget : 1 (€ - abordable), 2 (€€ - modéré), 3 (€€€ - cher)
    budget: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
      index: true,
    },
    address: { type: String, default: "" },
    city: { type: String, default: "Nice", index: true },
    postalCode: { type: String, default: "" },
    // Coordonnées au format GeoJSON standard pour requêtes géospatiales 2dsphere
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        default: [7.262, 43.7102], // Nice par défaut
      },
    },
    coverPhoto: { type: String, default: "" },
    photos: [photoSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviews: [reviewSchema],
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    favoritesCount: { type: Number, default: 0 },
    affluence: {
      type: String,
      enum: ["faible", "moderee", "elevee", "inconnue"],
      default: "inconnue",
    },
    ambianceScore: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Index géospatial pour la recherche par distance (carte et localisation)
spotSchema.index({ location: "2dsphere" });
// Index combinés pour le filtrage efficace
spotSchema.index({ category: 1, budget: 1 });
spotSchema.index({ ratingAverage: -1, favoritesCount: -1 });

/**
 * Prépare l'objet public envoyé au client Angular.
 */
spotSchema.methods.toPublic = function () {
  const coords = this.location?.coordinates || [7.262, 43.7102];
  return {
    id: String(this._id),
    title: this.title,
    description: this.description,
    category: this.category,
    moods: this.moods,
    budget: this.budget,
    address: this.address,
    city: this.city,
    postalCode: this.postalCode,
    location: this.location,
    longitude: coords[0],
    latitude: coords[1],
    coverPhoto: this.coverPhoto || (this.photos?.[0]?.url ?? ""),
    photos: (this.photos || []).map((p) => ({
      id: String(p._id),
      url: p.url,
      caption: p.caption,
      createdAt: p.createdAt,
    })),
    createdBy: String(this.createdBy),
    ratingAverage: Math.round((this.ratingAverage || 0) * 10) / 10,
    ratingCount: this.ratingCount || 0,
    favoritesCount: this.favoritesCount || 0,
    affluence: this.affluence,
    ambianceScore: this.ambianceScore,
    tags: this.tags || [],
    reviews: (this.reviews || []).map((r) => ({
      id: String(r._id),
      userId: String(r.user),
      userName: r.userName,
      rating: r.rating,
      comment: r.comment,
      moodExperienced: r.moodExperienced,
      createdAt: r.createdAt,
    })),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Spot = mongoose.model("Spot", spotSchema);

