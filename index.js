require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require("discord.js");
const { schedule } = require("node-cron");
const moment = require("moment-timezone");
const fs = require("fs");
const http = require("http");
const externalUsers = ["Grrkii", "WRNO_46", "m.yui", "yuu", "juni (^-^)"];


// Create a simple server to keep Replit alive
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is running!");
}).listen(3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let fishingData = {};

// Load data if exists
if (fs.existsSync("./fishingData.json")) {
    fishingData = JSON.parse(fs.readFileSync("./fishingData.json", "utf-8"));
}

// Save data periodically
const saveData = () => {
    fs.writeFileSync(
        "./fishingData.json",
        JSON.stringify(fishingData, null, 2),
    );
};

// Reset data daily at Japan midnight
schedule("0 15 * * *", () => {
    const today = moment().tz("Asia/Tokyo").format("YYYY-MM-DD");

    // Reset fishing data for today and include external users
    fishingData[today] = { discord: {}, external: {} };
    externalUsers.forEach((user) => {
        fishingData[today].external[user] = null; // External users start as not fished
    });

    saveData();
    console.log("Fishing data reset and external users populated!");
});


client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Handle interactions
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isCommand()) return;

    const today = moment().tz("Asia/Tokyo").format("YYYY-MM-DD");

    // Slash command for "fishing"
    if (interaction.commandName === "fish") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("fish_button")
                .setLabel("🎣 Mark Fishing as Done")
                .setStyle(ButtonStyle.Primary),
        );

        const embed = new EmbedBuilder()
            .setTitle("Fishing Activity")
            .setDescription(
                "Click the button below to mark your fishing as done for the day.",
            )
            .setColor("Aqua");

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true,
        });
    }

    // Slash command for "fishing for someone else"
    if (interaction.commandName === "fishfor") {
        const today = moment().tz("Asia/Tokyo").format("YYYY-MM-DD");
        const targetName = interaction.options.getString("target");
        const helper = interaction.member.displayName; // User who is helping

        if (!fishingData[today]) {
            fishingData[today] = { discord: {}, external: {} };
        }

        // Check if the target is an external user
        if (externalUsers.includes(targetName)) {
            if (fishingData[today].external[targetName] !== null) {
                await interaction.reply({
                    content: `${targetName} has already been marked as fished for today!`,
                    ephemeral: true,
                });
                return;
            }

            // Record the helper for the external user
            fishingData[today].external[targetName] = helper;
            saveData();

            await interaction.reply({
                content: `🎣 You helped ${targetName} fish for today!`,
                ephemeral: true,
            });
            return;
        }

        // Check if the target is a Discord user
        const members = await interaction.guild.members.fetch();
        const discordUser = members.find(
            (member) => member.displayName === targetName
        );

        if (discordUser) {
            if (fishingData[today].discord[discordUser.user.id] !== undefined) {
                await interaction.reply({
                    content: `${targetName} has already been marked as fished for today!`,
                    ephemeral: true,
                });
                return;
            }

            // Record the helper for the Discord user
            fishingData[today].discord[discordUser.user.id] = helper;
            saveData();

            await interaction.reply({
                content: `🎣 You helped ${targetName} fish for today!`,
                ephemeral: true,
            });
            return;
        }

        // If no match found
        await interaction.reply({
            content: `User ${targetName} is not recognized! Please enter a valid name.`,
            ephemeral: true,
        });
    }



    // Button interaction
    if (interaction.customId === "fish_button") {
        const userId = interaction.user.id;

        // Check if the user already marked for today
        if (fishingData[today] && fishingData[today][userId]) {
            await interaction.reply({
                content: "You have already marked your fishing as done today!",
                ephemeral: true,
            });
        } else {
            if (!fishingData[today]) fishingData[today] = {};
            fishingData[today][userId] = null; // User fished themselves
            saveData();

            await interaction.reply({
                content: "🎣 You marked your fishing as done for today!",
                ephemeral: true,
            });
        }
    }

    // Slash command to check who has fished
    if (interaction.commandName === "checked") {
        const today = moment().tz("Asia/Tokyo").format("YYYY-MM-DD");
        const todayData = fishingData[today] || { discord: {}, external: {} };

        const fished = [];
        const notFished = [];

        // Process external users
        externalUsers.forEach((user) => {
            if (todayData.external[user] !== null) {
                fished.push(`${user} (helped by ${todayData.external[user]})`);
            } else {
                notFished.push(user);
            }
        });

        // Process Discord users
        const members = await interaction.guild.members.fetch();
        members.forEach((member) => {
            if (!member.user.bot) {
                const name = member.displayName;
                if (todayData.discord[member.user.id] !== undefined) {
                    const helperId = todayData.discord[member.user.id];
                    const helper = helperId
                        ? ` (${members.get(helperId)?.displayName || "Unknown"})`
                        : "";
                    fished.push(`${name}${helper}`);
                } else {
                    notFished.push(name);
                }
            }
        });

        const totalMembers = fished.length + notFished.length;
        const embed = new EmbedBuilder()
            .setTitle("Fishing Status")
            .setDescription(`Here's the fishing status for today (${today}):`)
            .addFields(
                {
                    name: `🎣 Fished (${fished.length}/${totalMembers}):`,
                    value:
                        fished.length > 0
                            ? fished.join("\n")
                            : "No one has fished yet.",
                    inline: false,
                },
                {
                    name: `❌ Not Fished (${notFished.length}/${totalMembers}):`,
                    value:
                        notFished.length > 0
                            ? notFished.join("\n")
                            : "Everyone has fished!",
                    inline: false,
                },
            )
            .setFooter({ text: `Total: ${totalMembers} members` })
            .setColor("Green");

        await interaction.reply({ embeds: [embed] });
    }
});

// Register commands
client.on("ready", async () => {
    const commands = [
        {
            name: "fish",
            description: "Start the fishing activity.",
        },
        {
            name: "fishfor",
            description: "Help someone else fish.",
            options: [
                {
                    type: 3, // String type
                    name: "target",
                    description: "The name of the user to fish for (Discord or external)",
                    required: true,
                },
            ],
        }

,
        {
            name: "checked",
            description: "Check who has fished and who has not.",
        },
    ];

    await client.application.commands.set(commands);
    console.log("Commands registered!");
});

// Log in the bot
client.login(process.env.TOKEN);
