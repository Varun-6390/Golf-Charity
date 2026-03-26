const express = require("express");

const MonthlyDraw = require("../models/MonthlyDraw");

const router = express.Router();

function getCurrentMonthKeyUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

router.get("/current", async (_req, res) => {
  const monthKey = getCurrentMonthKeyUTC();
  const draw = await MonthlyDraw.findOne({ monthKey, status: "published" }).lean();
  if (!draw) return res.status(404).json({ error: "No published draw for current month" });

  return res.json({
    id: draw._id,
    monthKey: draw.monthKey,
    logicType: draw.logicType,
    drawNumbers: draw.drawNumbers,
    tierTotalsCents: draw.tierTotalsCents,
    status: draw.status,
  });
});

router.get("/:monthKey", async (req, res) => {
  const { monthKey } = req.params;
  const draw = await MonthlyDraw.findOne({ monthKey, status: "published" }).lean();
  if (!draw) return res.status(404).json({ error: "Draw not found or not published yet" });

  return res.json({
    id: draw._id,
    monthKey: draw.monthKey,
    logicType: draw.logicType,
    drawNumbers: draw.drawNumbers,
    tierTotalsCents: draw.tierTotalsCents,
    status: draw.status,
  });
});

module.exports = router;

