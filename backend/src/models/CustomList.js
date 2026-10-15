import mongoose from "mongoose";

/*
 * Modèle pour les listes personnalisées de lieux (ex: "Mes cafés préférés pour réviser",
 * "Spots photo coucher de soleil", etc.)
 */
const customListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isPublic: { type: Boolean, default: true },
    spots: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Spot",
      },
    ],
  },
  { timestamps: true },
);

customListSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    name: this.name,
    description: this.description,
    ownerId: String(this.ownerId),
    isPublic: this.isPublic,
    spots: this.spots,
    spotsCount: this.spots ? this.spots.length : 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const CustomList = mongoose.model("CustomList", customListSchema);

