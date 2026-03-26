const mongoose = require('mongoose');
require('./src/models/User');
require('./src/models/MonthlyDraw');
require('./src/models/WinnerEligibility');
require('./src/models/Subscription');
require('./src/models/Score');

const User = mongoose.model('User');
const MonthlyDraw = mongoose.model('MonthlyDraw');
const WinnerEligibility = mongoose.model('WinnerEligibility');
const Subscription = mongoose.model('Subscription');
const Score = mongoose.model('Score');

const fs = require('fs');

async function debug() {
  let log = '';
  const logger = (msg) => {
    console.log(msg);
    log += msg + '\n';
  };

  await mongoose.connect('mongodb://localhost:27017/golf_charity');
  
  const currentMonth = '2026-03';
  const draw = await MonthlyDraw.findOne({ monthKey: currentMonth });
  logger('--- DRAW INFO ---');
  logger(`Month: ${currentMonth}`);
  if (!draw) {
    logger('No draw found for this month');
  } else {
    logger(`ID: ${draw._id}`);
    logger(`Status: ${draw.status}`);
    logger(`Numbers: ${JSON.stringify(draw.drawNumbers)}`);
  }

  const eligibilities = await WinnerEligibility.find({ drawId: draw?._id });
  logger('\n--- ELIGIBILITIES ---');
  logger(`Count: ${eligibilities.length}`);
  for (const e of eligibilities) {
    const user = await User.findById(e.userId);
    logger(`- User: ${user?.email || e.userId}, MatchCount: ${e.matchCount}, UserID: ${e.userId}, DrawID: ${e.drawId}`);
  }

  const allUsers = await User.find();
  logger('\n--- ALL USERS & SCORES ---');
  for (const u of allUsers) {
    const sub = await Subscription.findOne({ userId: u._id });
    const userScores = await Score.find({ userId: u._id }).sort({ scoreDate: -1, createdAt: -1 }).limit(5);
    const scoreVals = userScores.map(s => s.stableford);
    const matches = draw ? draw.drawNumbers.filter(n => scoreVals.includes(n)).length : 0;
    
    logger(`- ${u.email} (${u.role}) | ID: ${u._id} | Sub Status: ${sub?.status || 'none'}`);
    logger(`  Latest Scores: [${scoreVals.join(', ')}] | Match Count: ${matches}`);
    
    const elig = await WinnerEligibility.findOne({ drawId: draw?._id, userId: u._id });
    logger(`  In WinnerEligibility DB: ${elig ? 'YES (' + elig.matchCount + ')' : 'NO'}`);
  }

  fs.writeFileSync('debug_results.txt', log);
  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
