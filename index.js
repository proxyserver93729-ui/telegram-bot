const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot("8696119704:AAHPDeefKq05KPMInNib3GibwvFrACkM9vs", { polling: true });

const ADMIN_PASSWORD = "abcd889911";
const BOT_USERNAME = "free_reedeem_coad_gererator_bot";

// MEMORY DATA (no DB)
let users = {};
let channels = [];
let adminAccess = {};
let userState = {};
let withdrawRequests = [];
let withdrawStep = {};
let broadcastStep = {};

// START
bot.onText(/\/start/, (msg) => {
  let id = msg.from.id;

  if (!users[id]) {
    users[id] = {
      balance: 0,
      referrals: 0,
      lastBonus: 0
    };
  }

  let buttons = [];
  let row = [];

  channels.forEach((ch, i) => {
    row.push({
      text: `Channel ${i + 1}`,
      url: `https://t.me/${ch.replace("@","")}`
    });

    if (row.length === 2) {
      buttons.push(row);
      row = [];
    }
  });

  if (row.length > 0) buttons.push(row);

  buttons.push([{ text: "✅ Verify", callback_data: "verify" }]);

  bot.sendMessage(id, "🔒 Join all channels and click verify", {
    reply_markup: { inline_keyboard: buttons }
  });
});

// CALLBACK
bot.on("callback_query", (q) => {
  let id = q.from.id;
  let data = q.data;

  let user = users[id];

  if (data === "verify") {
    bot.editMessageText("🎉 Welcome!", {
      chat_id: id,
      message_id: q.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👥 Refer", callback_data: "refer" },
            { text: "💸 Withdraw", callback_data: "withdraw" }
          ],
          [
            { text: "🎁 Bonus", callback_data: "bonus" },
            { text: "👤 Profile", callback_data: "profile" }
          ]
        ]
      }
    });
  }

  if (data === "profile") {
    bot.sendMessage(id,
`👤 Profile

💰 Balance: ${user.balance}
👥 Referrals: ${user.referrals}`);
  }

  if (data === "refer") {
    bot.sendMessage(id,
`👥 Refer & Earn

https://t.me/${BOT_USERNAME}?start=${id}`);
  }

  if (data === "bonus") {
    let now = Date.now();

    if (now - user.lastBonus < 86400000) {
      return bot.sendMessage(id, "❌ Already claimed today");
    }

    user.balance += 0.5;
    user.lastBonus = now;

    bot.sendMessage(id, "🎁 ₹0.50 added");
  }

  if (data === "withdraw") {
    withdrawStep[id] = {};
    bot.sendMessage(id, "Enter amount:");
  }

  // ADMIN ACTIONS
  if (adminAccess[id]) {

    if (data === "add_ch") {
      userState[id] = "add_channel";
      bot.sendMessage(id, "Send channel @username");
    }

    if (data === "del_ch") {
      let btns = channels.map((ch, i) => [{
        text: ch,
        callback_data: "del_" + i
      }]);

      bot.sendMessage(id, "Select channel to delete", {
        reply_markup: { inline_keyboard: btns }
      });
    }

    if (data.startsWith("del_")) {
      let i = data.split("_")[1];
      channels.splice(i, 1);
      bot.sendMessage(id, "❌ Channel deleted");
    }

    if (data === "withdraw_requests") {
      withdrawRequests.forEach((req, i) => {
        bot.sendMessage(id,
`Request #${i}

User: ${req.userId}
Amount: ${req.amount}
UPI: ${req.upi}`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Approve", callback_data: "approve_" + i },
                { text: "❌ Reject", callback_data: "reject_" + i }
              ]
            ]
          }
        });
      });
    }

    if (data.startsWith("approve_")) {
      let i = data.split("_")[1];
      let req = withdrawRequests[i];

      bot.sendMessage(req.userId, "✅ Withdraw Successful");
      withdrawRequests.splice(i, 1);
    }

    if (data.startsWith("reject_")) {
      let i = data.split("_")[1];
      let req = withdrawRequests[i];

      bot.sendMessage(req.userId, "❌ Withdraw Failed");
      withdrawRequests.splice(i, 1);
    }

    if (data === "broadcast") {
      broadcastStep[id] = true;
      bot.sendMessage(id, "Send message/photo/video");
    }
  }
});

// MESSAGE
bot.on("message", (msg) => {
  let id = msg.from.id;
  let text = msg.text;

  // ADMIN LOGIN
  if (text === "/admin") {
    userState[id] = "pass";
    return bot.sendMessage(id, "Enter password:");
  }

  if (userState[id] === "pass") {
    if (text === ADMIN_PASSWORD) {
      adminAccess[id] = true;
      userState[id] = null;

      return bot.sendMessage(id, "✅ Admin Access", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Add Channel", callback_data: "add_ch" }],
            [{ text: "❌ Delete Channel", callback_data: "del_ch" }],
            [{ text: "📢 Broadcast", callback_data: "broadcast" }],
            [{ text: "💸 Withdraw Requests", callback_data: "withdraw_requests" }]
          ]
        }
      });
    } else {
      return bot.sendMessage(id, "❌ Wrong password");
    }
  }

  // ADD CHANNEL
  if (userState[id] === "add_channel") {
    channels.push(text);
    userState[id] = null;
    return bot.sendMessage(id, "✅ Channel added");
  }

  // WITHDRAW
  if (withdrawStep[id] && !withdrawStep[id].amount) {
    withdrawStep[id].amount = parseFloat(text);
    return bot.sendMessage(id, "Enter UPI / Email:");
  } else if (withdrawStep[id] && !withdrawStep[id].upi) {
    withdrawStep[id].upi = text;

    withdrawRequests.push({
      userId: id,
      amount: withdrawStep[id].amount,
      upi: text
    });

    bot.sendMessage(id, "✅ Withdraw request sent");
    delete withdrawStep[id];
  }

  // BROADCAST
  if (broadcastStep[id]) {
    Object.keys(users).forEach(uid => {
      bot.copyMessage(uid, id, msg.message_id);
    });

    broadcastStep[id] = false;
    bot.sendMessage(id, "✅ Broadcast sent");
  }
});
