const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

// Токен вашего бота
const token = '7088257898:AAHi6ec6mZeF5tbZxpzyj9OF_CyuY68iYPw';
const bot = new TelegramBot(token, { polling: true });

// Список админов (укажите ваши ID)
let admins = [6576634479]; // Замените на ID ваших админов

// Хранилище для заявок на вывод средств
const withdrawalRequests = {};

// Хранилище для балансов пользователей и рефералов
const userBalances = {};
const userReferrals = {};
const referralReward = 30;
const clickReward = 1;
const exchangeRate = 1000; // 1000 монет = 100 ТГ

// Генерация реферальной ссылки
function generateReferralLink(userId) {
    const token = crypto.randomBytes(16).toString('hex');
    return `https://t.me/YOUR_BOT_USERNAME?start=${token}`;
}

// Установка начального состояния
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;

    if (!userBalances[chatId]) {
        userBalances[chatId] = 0;
    }

    if (!userReferrals[chatId]) {
        userReferrals[chatId] = [];
    }

    const referralLink = generateReferralLink(chatId);
    bot.sendMessage(chatId, `Добро пожаловать, ${username}! Вот ваше меню:`, {
        reply_markup: {
            keyboard: [
                ['💰 Заработать', '👁 Просмотры'],
                ['📁 Личный кабинет', '📤 Вывести'],
                ['💵 Обменять монеты', '📧 Пригласить'],
                ['❓ Информация', '🤖 Тех.Поддержка']
            ],
            resize_keyboard: true
        }
    });
    bot.sendMessage(chatId, `Ваша реферальная ссылка: ${referralLink}`);
});

// Обработка реферальных ссылок
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const referralToken = match[1];

    // Ищем пользователя с этим токеном
    for (let userId in userReferrals) {
        const link = generateReferralLink(userId);
        if (link.includes(referralToken)) {
            if (!userReferrals[userId].includes(chatId)) {
                userReferrals[userId].push(chatId);
                userBalances[userId] = (userBalances[userId] || 0) + referralReward;
                userBalances[chatId] = (userBalances[chatId] || 0) + referralReward;
                bot.sendMessage(userId, `Вам начислено ${referralReward} монет за приглашение пользователя @${msg.from.username || msg.from.first_name}. Ваш текущий баланс: ${userBalances[userId]} монет.`);
            }
            break;
        }
    }

    bot.sendMessage(chatId, 'Вы успешно зарегистрировались! Вот ваше меню:');
    bot.sendMessage(chatId, 'Введите /start для возвращения в меню.');
});

// Команда "Заработать"
bot.onText(/💰 Заработать/, (msg) => {
    const chatId = msg.chat.id;

    if (userBalances[chatId] !== undefined) {
        userBalances[chatId] += clickReward;
        bot.sendMessage(chatId, `Вы заработали ${clickReward} монет. Ваш текущий баланс: ${userBalances[chatId]} монет.`);
    } else {
        bot.sendMessage(chatId, 'Ошибка. Попробуйте снова.');
    }
});

// Команда "Пригласить"
bot.onText(/📧 Пригласить/, (msg) => {
    const chatId = msg.chat.id;

    const referralLink = generateReferralLink(chatId);
    bot.sendMessage(chatId, `Ваша реферальная ссылка: ${referralLink}`);
});

// Команда "Обменять монеты"
bot.onText(/💵 Обменять монеты/, (msg) => {
    const chatId = msg.chat.id;
    const balance = userBalances[chatId] || 0;

    if (balance > 0) {
        const amountInTenge = balance * (100 / exchangeRate);
        bot.sendMessage(chatId, `Вы можете обменять ваши монеты на деньги.\nВаш текущий баланс: ${balance} монет (${amountInTenge.toFixed(2)} ТГ).`);
        bot.sendMessage(chatId, 'Введите сумму для обмена (в монетах):');
    } else {
        bot.sendMessage(chatId, 'У вас недостаточно монет для обмена.');
    }
});

// Обработка суммы для обмена
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text.trim();

    if (userBalances[chatId] !== undefined && !isNaN(parseFloat(messageText)) && parseFloat(messageText) > 0) {
        const amountToExchange = parseFloat(messageText);

        if (amountToExchange <= userBalances[chatId]) {
            const amountInTenge = amountToExchange * (100 / exchangeRate);

            bot.sendMessage(chatId, `Вы запросили обмен ${amountToExchange} монет на ${amountInTenge.toFixed(2)} ТГ. Пожалуйста, подтвердите вывод средств.`);

            withdrawalRequests[chatId] = {
                paymentMethod: null,
                walletNumber: null,
                amount: amountInTenge
            };

            bot.sendMessage(chatId, 'Выберите способ вывода средств:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Банковская карта', callback_data: 'withdraw_card' }],
                        [{ text: 'Payeer', callback_data: 'withdraw_payeer' }],
                        [{ text: 'Qiwi', callback_data: 'withdraw_qiwi' }]
                    ]
                }
            });

            userBalances[chatId] -= amountToExchange;
        } else {
            bot.sendMessage(chatId, 'Недостаточно монет для обмена. Попробуйте снова.');
        }
    }
});

// Обработка выбора способа вывода
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const method = query.data;

    let paymentMethod;
    if (method === 'withdraw_card') {
        paymentMethod = 'Банковская карта';
    } else if (method === 'withdraw_payeer') {
        paymentMethod = 'Payeer';
    } else if (method === 'withdraw_qiwi') {
        paymentMethod = 'Qiwi';
    }

    if (withdrawalRequests[chatId]) {
        withdrawalRequests[chatId].paymentMethod = paymentMethod;

        bot.sendMessage(chatId, `Введите номер вашей ${paymentMethod}:`);
    }
});

// Ожидание ответа с номером кошелька или карты
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (withdrawalRequests[chatId] && withdrawalRequests[chatId].paymentMethod) {
        const walletNumber = msg.text.trim();
        withdrawalRequests[chatId].walletNumber = walletNumber;

        bot.sendMessage(chatId, 'Введите сумму для вывода:');

        bot.once('message', (msg) => {
            const amount = parseFloat(msg.text.trim());
            if (isNaN(amount) || amount <= 0 || amount !== withdrawalRequests[chatId].amount) {
                return bot.sendMessage(chatId, 'Неверная сумма. Попробуйте снова.');
            }

            withdrawalRequests[chatId].amount = amount;

            bot.sendMessage(chatId, `Вы запросили вывод ${amount}₽ на ${withdrawalRequests[chatId].paymentMethod} (номер: ${withdrawalRequests[chatId].walletNumber}). Мы отправим ваш запрос администратору для проверки.`);

            admins.forEach((adminId) => {
                bot.sendMessage(adminId, `Пользователь @${msg.from.username || msg.from.first_name} запросил вывод ${amount}₽ на ${withdrawalRequests[chatId].paymentMethod}.\nНомер кошелька/карты: ${withdrawalRequests[chatId].walletNumber}`);
            });

            delete withdrawalRequests[chatId];
        });
    }
});

// Команда "Информация"
bot.onText(/❓ Информация/, (msg) => {
    const chatId = msg.chat.id;

    const balanceInTenge = (userBalances[chatId] || 0) * (100 / exchangeRate);
    bot.sendMessage(chatId, `Ваш текущий баланс: ${userBalances[chatId]} монет.\nКурс обмена: ${exchangeRate} монет = 100 ТГ.\nВаш баланс в ТГ: ${balanceInTenge.toFixed(2)} ТГ.`);
});

// Функция для отправки сообщений администраторам
function notifyAdmins(message) {
    admins.forEach(adminId => {
        bot.sendMessage(adminId, message);
    });
}

// Обработка всех сообщений для администраторов
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (admins.includes(chatId)) {
        // Администраторские команды (можно расширить логику)
        if (msg.text.toLowerCase() === 'проверить выводы') {
            bot.sendMessage(chatId, 'Нет новых запросов на вывод.');
        }
    }
});
