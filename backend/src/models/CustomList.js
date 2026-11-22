import mongoose from "mongoose";

/*
- Modèle pour les listes personnalisées de lieux (ex: "Mes cafés préférés pour réviser",
- "Spots photo coucher de soleil", etc.) avec support collaboratif.
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
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
    collaborators: (this.collaborators || []).map((c) =>
      c._id
        ? { id: String(c._id), name: c.name, email: c.email, avatar: c.avatar || "" }
        : String(c),
    ),
    spots: (this.spots || []).map((s) => (s.toPublic ? s.toPublic() : s)),
    spotsCount: this.spots ? this.spots.length : 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const CustomList = mongoose.model("CustomList", customListSchema);