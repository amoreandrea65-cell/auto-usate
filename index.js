require("dotenv").config();

const TOKEN = process.env.TOKEN;

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require("discord.js");

const fs = require("fs");

const CLIENT_ID = "1503701644419010670";

const SHOWROOM_CHANNEL = "showroom-auto";
const DATA_FILE = "./data.json";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});


// ---------------- SAFE DATA ----------------

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];

        const file = fs.readFileSync(DATA_FILE, "utf8");

        if (!file) return [];

        return JSON.parse(file);

    } catch (err) {
        console.log("⚠️ data.json corrotto → reset automatico");
        return [];
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}


// ---------------- SHOWROOM ----------------

async function updateShowroom(guild) {
    const data = loadData();

    let channel = guild.channels.cache.find(c => c.name === SHOWROOM_CHANNEL);

    if (!channel) {
        channel = await guild.channels.create({
            name: SHOWROOM_CHANNEL,
            type: 0
        });
    }

    const messages = await channel.bulkDelete(100, true).catch(() => null);
    if (messages) await channel.bulkDelete(messages, true).catch(() => {});

    if (data.length === 0) {
        return channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🚗 SHOWROOM AUTO")
                    .setDescription("Nessuna auto disponibile")
                    .setColor(0x00ffcc)
            ]
        });
    }

    for (let i = 0; i < data.length; i++) {
    const car = data[i];

    const embed = new EmbedBuilder()
        .setTitle(`🚗 ${car.name}`)
        .setColor(car.available ? 0x00ff00 : 0xff0000)
        .addFields(
            { name: "💰 Prezzo", value: `${car.price}€`, inline: true },
            { name: "🧰 Full Kit", value: car.fullkit ? "Sì" : "No", inline: true },
            { name: "⚙️ Tuning", value: car.tuning || "Nessuna", inline: false },
            { name: "📦 Stato", value: car.available ? "🟢 DISPONIBILE" : "🔴 VENDUTA", inline: false }
        );

    if (car.image) embed.setImage(car.image);

    const sent = await channel.send({ embeds: [embed] });

    data[i].messageId = sent.id;
}

saveData(data); // 🔥 SOLO QUI
}
    


// ---------------- SLASH COMMANDS ----------------

const commands = [
    new SlashCommandBuilder()
        .setName("addcar")
        .setDescription("Aggiungi un'auto allo showroom")
        .addStringOption(o =>
            o.setName("nome")
                .setDescription("Nome auto")
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName("prezzo")
                .setDescription("Prezzo auto")
                .setRequired(true)
        )
        .addBooleanOption(o =>
            o.setName("fullkit")
                .setDescription("Full kit?")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("tuning")
                .setDescription("Modifiche tuning")
        )
        .addAttachmentOption(o =>
            o.setName("immagine")
                .setDescription("Foto auto")
        ),

    new SlashCommandBuilder()
        .setName("sold")
        .setDescription("Segna un'auto come venduta")
        .addIntegerOption(o =>
            o.setName("index")
                .setDescription("Numero auto nello showroom")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("delcar")
        .setDescription("Rimuovi un'auto dallo showroom tramite message ID")
        .addStringOption(o =>
            o.setName("messageid")
                .setDescription("ID del messaggio Discord")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("showroom")
        .setDescription("Aggiorna lo showroom")
].map(c => c.toJSON());


// ---------------- REGISTER COMMANDS ----------------

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
    );

    console.log("✅ Slash commands registrati");
}


// ---------------- READY ----------------

client.once("ready", () => {
    console.log(`🤖 Online come ${client.user.tag}`);
});


// ---------------- INTERACTION ----------------

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;


    // ➕ ADD CAR
    if (interaction.commandName === "addcar") {

    // ⚠️ rispondi subito UNA volta sola
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString("nome");
    const price = interaction.options.getInteger("prezzo");
    const fullkit = interaction.options.getBoolean("fullkit");
    const tuning = interaction.options.getString("tuning") || "";
    const image = interaction.options.getAttachment("immagine");

    const data = loadData();

    data.push({
        name,
        price,
        fullkit,
        tuning,
        image: image ? image.url : null,
        available: true
    });

    saveData(data);

await updateShowroom(interaction.guild);

// 🔔 TAG RUOLO
const roleId = "1341141704303972395";

await interaction.channel.send({
    content: `<@&${roleId}> 🚗 Nuova auto disponibile nello showroom!`
});

return interaction.editReply("✅ Auto aggiunta allo showroom!");
}

    // 🔴 SOLD
    if (interaction.commandName === "sold") {

        await interaction.deferReply({ ephemeral: true });

        const index = interaction.options.getInteger("index");

        if (index < 1 || index > data.length) {
            return interaction.editReply("❌ Auto non trovata");
        }

        data[index - 1].available = false;

        saveData(data);
        await updateShowroom(interaction.guild);

        return interaction.editReply("🔴 Auto segnata come venduta!");
    }

    // 📊 SHOWROOM
    if (interaction.commandName === "showroom") {

        await interaction.deferReply({ ephemeral: true });

        await updateShowroom(interaction.guild);

        return interaction.editReply("📊 Showroom aggiornato!");
        
    }


    if (interaction.commandName === "delcar") {

    await interaction.deferReply({ ephemeral: true });

    const messageId = interaction.options.getString("messageid");

    let data = loadData();

    // 🔥 rimuove dal JSON PRIMA
    const newData = data.filter(car => car.messageId !== messageId);

    if (newData.length === data.length) {
        return interaction.editReply("❌ Auto non trovata nel database");
    }

    saveData(newData);

    // 🔥 cancella messaggio Discord
    const channel = interaction.guild.channels.cache.find(
        c => c.name === SHOWROOM_CHANNEL
    );

    try {
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
    } catch {}

    await updateShowroom(interaction.guild);

    return interaction.editReply("🗑️ Auto eliminata correttamente!");
}
});


// ---------------- START ----------------

registerCommands().then(() => {
    client.login(TOKEN);
});
