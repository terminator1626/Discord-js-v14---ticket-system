const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ],
    shards: "auto"
});
const fs = require('fs');
const path = require('path');
const fetch = require("isomorphic-fetch");
const config = require("./config.js");
const sequelize = require('./database');
const Ticket = require('./models/Ticket');
const TicketUser = require('./models/TicketUser');
const { createTranscript } = require('discord-html-transcripts');

client.login(config.token);

client.once('ready', async () => {
    await sequelize.sync();
    console.log(`Logged in as ${client.user.tag}`);
    setInterval(() => sendTicketEmbed(), 10000);
});

async function sendTicketEmbed() {
    try {
        const channel = client.channels.cache.get(config.channels.ticket);
        if (!channel) return;

        let ticket = await Ticket.findOne({ where: { messageId: { [Sequelize.Op.not]: null } } });
        if (!ticket) {
            const message = await channel.send({ embeds: [new EmbedBuilder().setTitle("Loading...")] });
            ticket = await Ticket.create({ messageId: message.id });
        }

        const message = await channel.messages.fetch(ticket.messageId);
        const embed = new EmbedBuilder()
            .setColor("Purple")
            .setTitle("Tickets")
            .setDescription(`
                > Last update: <t:${Math.floor(Date.now() / 1000)}:R>
                **[ EN ] TICKETS**
                - Ticket system is used in cases of:
                > - Problem with registration
                > - Collaboration
                > - Other technical problems
            `);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('partnership').setLabel('Partnership').setStyle(ButtonStyle.Secondary).setEmoji(config.emoji.ticket_partnership),
                new ButtonBuilder().setCustomId('bug').setLabel('Bug').setStyle(ButtonStyle.Secondary).setEmoji(config.emoji.ticket_bug),
                new ButtonBuilder().setCustomId('other').setLabel('Other').setStyle(ButtonStyle.Secondary).setEmoji(config.emoji.ticket_other)
            );

        await message.edit({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error(error);
    }
}

async function createTicket(guild, username, userId, roleId, category, reason, interaction) {
    const ticketName = `ticket-${username}`;
    const newTicket = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: userId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
            { id: roleId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] }
        ],
        parent: category,
    });

    await TicketUser.create({ ticketId: newTicket.id, userId });

    const welcomeMessage = new EmbedBuilder()
        .setAuthor({ name: `${username}\`s ticket`, iconURL: config.icons.ticket })
        .setDescription(`<@${userId}>, someone from <@&${roleId}> will assist you shortly.`)
        .addFields({ name: "Reason:", value: `> ${reason}` });

    const row = new ActionRowBuilder()
        .addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger));

    await newTicket.send({ content: `${config.invisiblePing} <@${userId}> <@&${roleId}>`, embeds: [welcomeMessage], components: [row] });

    await interaction.reply({ content: `We have created a ticket on the \`${reason}\` topic. You will be contacted soon.`, ephemeral: true });

    return newTicket;
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const { guild, user, customId } = interaction;
    const categoryId = config.channels.ticket_category;
    const roleId = config.role.ping.ticket;
    const reasons = {
        partnership: 'partnership',
        bug: 'bug',
        register: 'register',
        other: 'other'
    };

    if (reasons[customId]) {
        await createTicket(guild, user.username, user.id, roleId, categoryId, reasons[customId], interaction);
    }

    if (customId === 'close_ticket') {
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_close')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(confirmButton);

        await interaction.reply({ content: `Do you really want to close the ticket?`, components: [row], ephemeral: true });
    }

    if (customId === 'confirm_close') {
        const channel = interaction.channel;
        await closeTicket(channel, interaction);
    }
});

async function closeTicket(channel, interaction, client) {
    try {
        const transcriptBuffer = await createTranscript(channel, {
            returnType: 'buffer',
            filename: `${channel.name}.html`,
            saveImages: true,
            footerText: "Exported {number} message{s}",
            poweredBy: false,
            ssr: true
        });
        const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'transcripts');
        if (logChannel) {
            const user = await Ticket.findOne({ where: { ticketId: channel.id } });
            const ticketAuthor = await client.users.fetch(user.userId);
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${ticketAuthor.username}\`s ticket`, iconURL: client.user.avatarURL() })
                .setColor("DarkBlue")
                .addFields(
                    { name: "Server", value: interaction.guild.name, inline: true },
                    { name: "Closed by", value: interaction.user.username, inline: true }
                )
                .setFooter({ text: "© YourBotName", iconURL: client.user.avatarURL() });

            await logChannel.send({ embeds: [embed], files: [{ attachment: transcriptBuffer, name: `${channel.name}.html` }] });
            await ticketAuthor.send({ embeds: [embed], files: [{ attachment: transcriptBuffer, name: `${channel.name}.html` }] });
        }
        await channel.delete();
        await interaction.reply({ content: 'Your ticket has been closed.', ephemeral: true });
    } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.reply({ content: 'There was an error closing your ticket. Please try again later.', ephemeral: true });
    }
}
