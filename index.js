require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
} = require("discord.js");
const { schedule } = require("node-cron");
const moment = require("moment-timezone");
const fs = require("fs");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let fishingData = {};
let offlineUsers = []; // Store offline users

// Load data if exists
if (fs.existsSync("./fishingData.json")) {
    fishingData = JSON.parse(fs.readFileSync("./fishingData.json", "utf-8"));
}
if (fs.existsSync("./offlineUsers.json")) {
    offlineUsers = JSON.parse(fs.readFileSync("./offlineUsers.json", "utf-8"));
}

// Save data periodically
const saveData = () => {
    fs.writeFileSync(
        "./fishingData.json",
        JSON.stringify(fishingData, null, 2),
    );
    fs.writeFileSync(
        "./offlineUsers.json",
        JSON.stringify(offlineUsers, null, 2),
    );
};

// Reset data daily at Japan midnight
schedule("0 15 * * *", () => {
    fishingData = {};
    saveData();
    console.log("Fishing data reset!");
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Handle interactions
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isCommand() && !interaction.isStringSelectMenu()) return;

    const today = moment().tz("Asia/Tokyo").format("YYYY-MM-DD");

    // Slash command for "fishing"
    if (interaction.commandName === "fish") {
        const userId = interaction.user.id;

        // Check if the user already marked for today
        if (fishingData[today] && fishingData[today][userId]) {
            await interaction.reply({
                content: "You have already marked your fishing as done today!",
                ephemeral: true,
            });
        } else {
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
    }

    // Handle the fish button
    if (interaction.isButton() && interaction.customId === "fish_button") {
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

    // Slash command for "fishing for someone else"
    if (interaction.commandName === "fishfor") {
        const targetUser = interaction.options.getUser("target"); // User being helped
        const helperUser = interaction.user; // User helping

        if (!targetUser) {
            await interaction.reply({
                content: "Please specify a valid user to fish for!",
                ephemeral: true,
            });
            return;
        }

        // Check if the target user already fished
        if (fishingData[today] && fishingData[today][targetUser.id]) {
            await interaction.reply({
                content: `${targetUser.username} has already fished today!`,
                ephemeral: true,
            });
        } else {
            if (!fishingData[today]) fishingData[today] = {};
            fishingData[today][targetUser.id] = helperUser.id;
            saveData();

            await interaction.reply({
                content: `🎣 You helped ${targetUser.displayName || targetUser.username} fish for today!`,
                ephemeral: true,
            });
        }
    }

    // Slash command for "fishing for an offline user"
    if (interaction.commandName === "fishoffline") {
        if (offlineUsers.length === 0) {
            await interaction.reply({
                content: "There are no offline users to fish for! Add one using `/addoffline`.",
                ephemeral: true,
            });
            return;
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("select_offline_user")
                .setPlaceholder("Choose an offline user")
                .addOptions(
                    offlineUsers.map((user) => ({
                        label: user,
                        value: user,
                    }))
                )
        );

        await interaction.reply({
            content: "Select an offline user to mark as fished:",
            components: [row],
            ephemeral: true,
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "select_offline_user") {
        const selectedUser = interaction.values[0]; // Get selected offline user
        const helperUser = interaction.user;

        if (fishingData[today] && fishingData[today][selectedUser]) {
            await interaction.update({
                content: `The offline user "${selectedUser}" has already been marked as fished today!`,
                components: [],
            });
            return;
        }

        if (!fishingData[today]) fishingData[today] = {};
        fishingData[today][selectedUser] = helperUser.id; // Record the helper
        saveData();

        await interaction.update({
            content: `🎣 You have fished for the offline user "${selectedUser}" today!`,
            components: [],
        });
    }

    // Slash command to check who has fished
    if (interaction.commandName === "checked") {
        const guild = interaction.guild;
        const members = await guild.members.fetch();

        const todayData = fishingData[today] || {};

        const fished = [];
        const notFished = [];

        members.forEach((member) => {
            if (!member.user.bot) {
                const name = member.displayName; // Prefer nickname, fallback to username
                if (todayData[member.user.id] !== undefined) {
                    const helperId = todayData[member.user.id];
                    const helper = helperId
                        ? ` (${members.get(helperId)?.displayName || "Unknown"})`
                        : ""; // Show who helped, if applicable
                    fished.push(`${name}${helper}`);
                } else {
                    notFished.push(name);
                }
            }
        });

        offlineUsers.forEach((offlineUser) => {
            if (todayData[offlineUser] !== undefined) {
                const helperId = todayData[offlineUser];
                const helper = helperId
                    ? ` (${members.get(helperId)?.displayName || "Unknown"})`
                    : "";
                fished.push(`${offlineUser}${helper}`);
            } else {
                notFished.push(`${offlineUser} (Offline)`);
            }
        });

        const totalMembers = fished.length + notFished.length; // Total eligible members
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

    // Slash command to add an offline user
    if (interaction.commandName === "addoffline") {
        const offlineUser = interaction.options.getString("name").trim();

        if (!offlineUser || offlineUsers.includes(offlineUser)) {
            await interaction.reply({
                content: "Invalid or duplicate offline user name!",
                ephemeral: true,
            });
            return;
        }

        offlineUsers.push(offlineUser);
        saveData();

        await interaction.reply({
            content: `✅ Offline user "${offlineUser}" has been added!`,
            ephemeral: true,
        });
    }

    // Slash command to delete an offline user
    if (interaction.commandName === "deleteoffline") {
        const offlineUser = interaction.options.getString("name").trim();

        if (!offlineUser || !offlineUsers.includes(offlineUser)) {
            await interaction.reply({
                content: "Offline user not found!",
                ephemeral: true,
            });
            return;
        }

        offlineUsers = offlineUsers.filter((user) => user !== offlineUser);
        saveData();

        await interaction.reply({
            content: `❌ Offline user "${offlineUser}" has been removed!`,
            ephemeral: true,
        });
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
                    type: 6, // User type
                    name: "target",
                    description: "The user you want to help fish",
                    required: true,
                },
            ],
        },
        {
            name: "fishoffline",
            description: "Mark an offline user as fished.",
        },
        {
            name: "checked",
            description: "Check who has fished and who has not.",
        },
        {
            name: "addoffline",
            description: "Add an offline user to the fishing list.",
            options: [
                {
                    type: 3, // String type
                    name: "name",
                    description: "Name of the offline user to add",
                    required: true,
                },
            ],
        },
        {
            name: "deleteoffline",
            description: "Remove an offline user from the fishing list.",
            options: [
                {
                    type: 3, // String type
                    name: "name",
                    description: "Name of the offline user to remove",
                    required: true,
                },
            ],
        },
    ];

    await client.application.commands.set(commands);
    console.log("Commands registered!");
});

// Log in the bot
client.login(process.env.TOKEN);
