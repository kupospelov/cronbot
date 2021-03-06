const timers = require('timers');
const telegraf = require('telegraf');
const cron = require('node-cron');

const config = require('./config.json');
const tasks = require('./tasks.json');

const app = new telegraf(config.Token);

const handleKeyboard = function(config, task) {
	if (config.ShowKeyboard) {
		const keys = task.Options.map(o => o.Option);
		return telegraf.Markup.keyboard(keys)
			.oneTime()
			.resize()
			.extra();
	}

	return telegraf.Markup.removeKeyboard(true).extra();
};

app.telegram.getMe().then(
	bot => {
		const lastMessage = {
			time : 0,
			answers : []
		};

		app.options.username = bot.username;
		app.command('/greet', ctx => ctx.reply(config.GreetMessage));
		app.command('/shutdown', ctx => {
			if (ctx.update.message.from.id == config.OwnerId) {
				ctx.reply(config.FinishMessage).then(() => process.exit());
			}
			else {
				ctx.reply(config.UnauthorizedMessage);
			}
		});

		tasks.forEach(task => {
			task.Options.forEach(option => {
				app.hears(option.Option, ctx => {
					const elapsed = Date.now() - lastMessage.time;
					const reply = ctx.update.message.reply_to_message;
					const from = ctx.update.message.from;
					const handle = message => {
						if (message) {
							ctx.reply(message);
						}
					};

					if (reply && reply.from.id === bot.id && elapsed < config.Timeout) {
						if (lastMessage.answers.find(a => a === from.id) !== undefined) {
							handle(option.OnRepeat);
						}
						else {
							handle(option.OnReply);
							lastMessage.answers.push(from.id);
						}
					}
				});
			});

			task.Alarms.filter(a => !a.Disabled).forEach(alarm => {
				cron.schedule(alarm.Cron, () => {
					timers.setTimeout(() => {
						app.telegram.sendChatAction(alarm.ChatId, 'typing')
							.then(() => {
								var messageIndex = Math.floor(alarm.Messages.length * Math.random());

								app.telegram.sendMessage(
									alarm.ChatId,
									alarm.Messages[messageIndex],
									handleKeyboard(config, task))
										.then(() => {
											lastMessage.time = Date.now();
											lastMessage.answers = [];
										});
							});
					},
					alarm.RandomDelay * Math.random());
				});
			});
		});

		app.telegram.sendMessage(config.OwnerId, config.StartMessage);
		app.startPolling();
	});

