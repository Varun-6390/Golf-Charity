const express = require("express");
const cloudinary = require("cloudinary").v2;

const { env } = require("../config/env");

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const router = express.Router();

router.post("/signature", (req, res) => {
  const { folder = "winner-proofs" } = req.body ?? {};

  // Cloudinary expects a signature over the upload parameters.
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    timestamp,
    folder,
    upload_preset: env.CLOUDINARY_UPLOAD_PRESET,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);

  return res.json({
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    uploadPreset: env.CLOUDINARY_UPLOAD_PRESET,
    folder,
    timestamp,
    signature,
  });
});

module.exports = router;

