const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// 🔑 SETTINGS
const token = "8696119704:AAHPDeefKq05KPMInNib3GibwvFrACkM9vs";
const OWNER_ID = 8166370525;
const MONGO_URL = "YOUR_MONGO_URL";
const BOT_USERNAME = "free_reedeem_coad_gererator_bot";

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(MONGO_URL);

// 👤 USER MODEL
const User = mongoose.model("User", new mongoose.Schema({
  userId: Number,
  balance: { default: 0, type: Number },
  referred: { default: 0, type: Number },
  lastBonus: { default: 0, type: Number }
}));

// 📢 CHANNEL MODEL
const Channel = mongoose.model("Channel", new mongoose.Schema({
  username: String
}));

// 🔘 MAIN MENU
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👤 Profile", callback_data: "profile" }],
        [{ text: "🎁 Bonus", callback_data: "bonus" }],
        [{ text: "👥 Refer", callback_data: "refer" }],
        [{ text: "💸 Withdraw", callback_data: "withdraw" }]
      ]
    }
  };
}

// 👨‍💼 ADMIN MENU
function adminMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👥 Users", callback_data: "users" }],
        [{ text: "➕ Add Channel", callback_data: "add_ch" }],
        [{ text: "❌ Delete Channel", callback_data: "del_ch" }],
        [{ text: "📢 Broadcast", callback_data: "broadcast" }]
      ]
    }
  };
}

// ✅ CHECK JOIN
async function checkJoin(userId) {
  let channels = await Channel.find();
  for (let ch of channels) {
    let res = await bot.getChatMember(ch.username, userId);
    if (res.status == "left") return false;
  }
  return true;
}

// 🚀 START
bot.onText(/\/start(.*)/, async (msg, match) => {
  let userId = msg.from.id;
  let ref = match[1].trim();

  let user = await User.findOne({ userId });

  if (!user) {
    user = new User({ userId });

    if (ref && ref != userId) {
      let refUser = await User.findOne({ userId: ref });
      if (refUser) {
        refUser.balance += 10;
        refUser.referred += 1;
        await refUser.save();
      }
    }
    await user.save();
  }

  let channels = await Channel.find();

  let buttons = channels.map((ch, i) => [{
    text: `Join Channel ${i + 1}✨`,
    url: `https://t.me/${ch.username.replace("@","")}`
  }]);

  buttons.push([{ text: "✅ Joined (Verify)", callback_data: "verify" }]);

  bot.sendMessage(userId,
`🔥 Join All Channels And Click Verify`,
{
  reply_markup: { inline_keyboard: buttons }
});
});

// 🎯 CALLBACK
let adminStep = {};
let withdrawStep = {};

bot.on("callback_query", async (q) => {
  let userId = q.from.id;
  let data = q.data;

  let user = await User.findOne({ userId });

  // VERIFY
  if (data === "verify") {
    let joined = await checkJoin(userId);
    if (!joined) return bot.answerCallbackQuery(q.id, { text: "Join all channels ❌" });

    bot.editMessageText("🎉 Welcome!", {
      chat_id: userId,
      message_id: q.message.message_id,
      reply_markup: mainMenu().reply_markup
    });
  }

  // PROFILE
  if (data === "profile") {
    bot.editMessageText(
`👤 Profile

💰 Balance: ${user.balance}
👥 Referrals: ${user.referred}`, {
      chat_id: userId,
      message_id: q.message.message_id,
      reply_markup: mainMenu().reply_markup
    });
  }

  // BONUS
  if (data === "bonus") {
    let now = Date.now();
    if (now - user.lastBonus < 86400000) {
      return bot.answerCallbackQuery(q.id, { text: "Already claimed" });
    }

    user.balance += 5;
    user.lastBonus = now;
    await user.save();

    bot.answerCallbackQuery(q.id, { text: "+5 coins 🎁" });
  }

  // REFER
  if (data === "refer") {
    bot.editMessageText(
`👥 Refer & Earn

https://t.me/${BOT_USERNAME}?start=${userId}`, {
      chat_id: userId,
      message_id: q.message.message_id,
      reply_markup: mainMenu().reply_markup
    });
  }

  // WITHDRAW
  if (data === "withdraw") {
    withdrawStep[userId] = {};
    bot.sendMessage(userId, "Enter Amount:");
  }

  // ADMIN PANEL
  if (data === "admin" && userId == OWNER_ID) {
    bot.editMessageText("Admin Panel", {
      chat_id: userId,
      message_id: q.message.message_id,
      reply_markup: adminMenu().reply_markup
    });
  }

  // USERS
  if (data === "users" && userId == OWNER_ID) {
    let count = await User.countDocuments();
    bot.answerCallbackQuery(q.id, { text: `Users: ${count}` });
  }

  // ADD CHANNEL
  if (data === "add_ch" && userId == OWNER_ID) {
    adminStep[userId] = "add";
    bot.sendMessage(userId, "Send channel @username");
  }

  // DELETE CHANNEL
  if (data === "del_ch" && userId == OWNER_ID) {
    let chs = await Channel.find();

    let btns = chs.map(ch => [{
      text: ch.username,
      callback_data: "del_" + ch._id
    }]);

    bot.sendMessage(userId, "Select to delete", {
      reply_markup: { inline_keyboard: btns }
    });
  }

  // REMOVE CHANNEL
  if (data.startsWith("del_") && userId == OWNER_ID) {
    let id = data.split("_")[1];
    await Channel.findByIdAndDelete(id);
    bot.sendMessage(userId, "Deleted ❌");
  }
});

// 💬 MESSAGE
bot.on("message", async (msg) => {
  let userId = msg.from.id;
  let text = msg.text;

  let user = await User.findOne({ userId });

  // ADD CHANNEL
  if (userId == OWNER_ID && adminStep[userId] === "add") {
    await new Channel({ username: text }).save();
    bot.sendMessage(userId, "Channel Added ✅");
    adminStep[userId] = null;
  }

  // WITHDRAW FLOW
  if (withdrawStep[userId] && !withdrawStep[userId].amount) {
    withdrawStep[userId].amount = parseInt(text);
    bot.sendMessage(userId, "Enter Email:");
  } else if (withdrawStep[userId] && !withdrawStep[userId].email) {
    withdrawStep[userId].email = text;

    if (user.balance < withdrawStep[userId].amount) {
      bot.sendMessage(userId, "❌ Not enough balance");
      delete withdrawStep[userId];
      return;
    }

    user.balance -= withdrawStep[userId].amount;
    await user.save();

    bot.sendMessage(OWNER_ID,
`Withdraw Request

User: ${userId}
Amount: ${withdrawStep[userId].amount}
Email: ${withdrawStep[userId].email}`);

    bot.sendMessage(userId, "Request Sent ✅");

    delete withdrawStep[userId];
  }
});

// 📢 BROADCAST
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (msg.from.id != OWNER_ID) return;

  let text = match[1];
  let users = await User.find();

  users.forEach(u => {
    bot.sendMessage(u.userId, text);
  });

  bot.sendMessage(msg.chat.id, "Sent ✅");
});

// 🎁 SEND REDEEM CODE
bot.onText(/\/send (.+)/, (msg, match) => {
  if (msg.from.id != OWNER_ID) return;

  let [id, code] = match[1].split(" ");
  bot.sendMessage(id, `🎁 Your Redeem Code:\n${code}`);
});
