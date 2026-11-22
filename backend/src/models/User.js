import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/*
- Schéma d'une demande d'ami reçue par un utilisateur.
 */
const friendRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/*
- Un schéma Mongoose décrit la forme des documents MongoDB et leurs règles de
- validation. `timestamps` ajoute automatiquement createdAt et updatedAt.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false empêche de renvoyer le hash par défaut dans les requêtes.
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: "" },
    bio: { type: String, trim: true, default: "" },
    // Humeurs ou ambiances favorites (ex: travail, calme, festif, gourmand)
    tastes: { type: [String], default: [] },
    // Références vers les spots mis en favoris par l'utilisateur
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Spot" }],
    // Badges débloqués : "explorateur", "foodie", "photographe", "pionnier"
    badges: { type: [String], default: ["pionnier"] },
    // Réseau social : liste des amis acceptés et demandes reçues
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: { type: [friendRequestSchema], default: [] },
  },
  { timestamps: true },
);

schema.virtual("password").set(function (value) {
  this._plainPassword = value;
});

schema.pre("validate", async function () {
  if (this.isNew && this._plainPassword) {
    console.debug(`[user-model] Hachage du mot de passe pour ${this.email}`);
    this.passwordHash = await bcrypt.hash(this._plainPassword, 10);
  }
});

/** Compare un mot de passe reçu avec le hash stocké. */
schema.methods.verifyPassword = function (value) {
  console.debug(`[user-model] Vérification du mot de passe pour ${this.email}`);
  return bcrypt.compare(value, this.passwordHash);
};

/** Ajoute un badge s'il n'est pas déjà présent. */
schema.methods.awardBadge = function (badge) {
  if (!this.badges.includes(badge)) {
    this.badges.push(badge);
    return true;
  }
  return false;
};

/** Retourne uniquement les champs qu'une réponse HTTP peut exposer. */
schema.methods.toPublic = function () {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    avatar: this.avatar || "",
    bio: this.bio || "",
    tastes: this.tastes || [],
    favorites: (this.favorites || []).map((f) => (f._id ? String(f._id) : String(f))),
    badges: this.badges || ["pionnier"],
    friends: (this.friends || []).map((f) => (f._id ? String(f._id) : String(f))),
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", schema);