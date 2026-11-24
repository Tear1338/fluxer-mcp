# Fluxer Permissions Reference

Fluxer MCP uses Fluxer's exact permission bitfield verified against `fluxerapp/fluxer/packages/constants/src/ChannelConstants.ts` and `ThreadPermissionUtils.ts` (**37 core bits + 4 thread bits = 41 permissions**).

All permission integers exceed `Number.MAX_SAFE_INTEGER` and are always transmitted as base-10 strings (e.g. `"8"` for `ADMINISTRATOR`).

---

## Recommended Permission Presets

| Use Case | Recommended Fluxer Permissions |
| --- | --- |
| **Read-Only Auditor** | `VIEW_CHANNEL`, `READ_MESSAGE_HISTORY`, `VIEW_AUDIT_LOG`, `VIEW_CHANNEL_MEMBERS` |
| **Daily Moderator** | Auditor + `SEND_MESSAGES`, `MANAGE_MESSAGES`, `PIN_MESSAGES`, `KICK_MEMBERS`, `BAN_MEMBERS`, `MODERATE_MEMBERS`, `MANAGE_NICKNAMES`, `MUTE_MEMBERS`, `DEAFEN_MEMBERS`, `MOVE_MEMBERS`, `MANAGE_THREADS` |
| **Community Architect / Full Admin** | `ADMINISTRATOR` (or `MANAGE_GUILD`, `MANAGE_ROLES`, `MANAGE_CHANNELS`, `MANAGE_WEBHOOKS`, `MANAGE_EXPRESSIONS`, `CREATE_EXPRESSIONS`, `CREATE_INSTANT_INVITE`, plus Moderator permissions) |

---

## Complete Fluxer Permission Bitfield Table

| Bit | Name | Decimal Value | Fluxer Notes |
| ---: | --- | ---: | --- |
| 0 | `CREATE_INSTANT_INVITE` | `1` | Create channel invites |
| 1 | `KICK_MEMBERS` | `2` | Kick guild members |
| 2 | `BAN_MEMBERS` | `4` | Permanent & temporary bans (`ban_duration_seconds`) |
| 3 | `ADMINISTRATOR` | `8` | Grants all permissions & bypasses channel overwrites |
| 4 | `MANAGE_CHANNELS` | `16` | Create, edit, reorder, delete channels & forum tags |
| 5 | `MANAGE_GUILD` | `32` | Update guild settings, vanity URL, discovery, list guild invites |
| 6 | `ADD_REACTIONS` | `64` | Add reactions |
| 7 | `VIEW_AUDIT_LOG` | `128` | Read guild audit logs |
| 8 | `PRIORITY_SPEAKER` | `256` | Voice priority speaker |
| 9 | `STREAM` | `512` | Go live / stream |
| 10 | `VIEW_CHANNEL` | `1024` | View channel & read messages |
| 11 | `SEND_MESSAGES` | `2048` | Send messages & create forum posts |
| 12 | `SEND_TTS_MESSAGES` | `4096` | Send TTS messages |
| 13 | `MANAGE_MESSAGES` | `8192` | Delete messages, bulk delete, remove reactions & attachments |
| 14 | `EMBED_LINKS` | `16384` | Attach rich embeds |
| 15 | `ATTACH_FILES` | `32768` | Upload attachments |
| 16 | `READ_MESSAGE_HISTORY` | `65536` | Read message history & archived threads |
| 17 | `MENTION_EVERYONE` | `131072` | Mention `@everyone` / `@here` |
| 18 | `USE_EXTERNAL_EMOJIS` | `262144` | External custom emojis |
| 20 | `CONNECT` | `1048576` | Connect to voice channels |
| 21 | `SPEAK` | `2097152` | Speak in voice channels |
| 22 | `MUTE_MEMBERS` | `4194304` | Server-mute members in voice |
| 23 | `DEAFEN_MEMBERS` | `8388608` | Server-deafen members in voice |
| 24 | `MOVE_MEMBERS` | `16777216` | Move/disconnect members in voice |
| 25 | `USE_VAD` | `33554432` | Voice activity detection |
| 26 | `CHANGE_NICKNAME` | `67108864` | Change own guild nickname |
| 27 | `MANAGE_NICKNAMES` | `134217728` | Change other members' nicknames |
| 28 | `MANAGE_ROLES` | `268435456` | Create/edit/delete roles, hoist positions, channel overwrites |
| 29 | `MANAGE_WEBHOOKS` | `536870912` | Manage webhooks & follow announcements |
| 30 | `MANAGE_EXPRESSIONS` | `1073741824` | Edit/delete emojis & stickers |
| 34 | `MANAGE_THREADS` | `17179869184` | Lock, archive, delete threads & manage private threads |
| 35 | `CREATE_PUBLIC_THREADS` | `34359738368` | Start public threads |
| 36 | `CREATE_PRIVATE_THREADS` | `68719476736` | Start private threads |
| 37 | `USE_EXTERNAL_STICKERS` | `137438953472` | External stickers |
| 38 | `SEND_MESSAGES_IN_THREADS` | `274877906944` | Reply inside threads |
| 40 | `MODERATE_MEMBERS` | `1099511627776` | Timeout members (`communication_disabled_until`) |
| 43 | `CREATE_EXPRESSIONS` | `8796093022208` | Create/bulk-create/clone emojis & stickers |
| 51 | `PIN_MESSAGES` | `2251799813685248` | **Fluxer-specific**: dedicated pin/unpin permission |
| 52 | `BYPASS_SLOWMODE` | `4503599627370496` | **Fluxer-specific**: bypass channel slowmode |
| 53 | `UPDATE_RTC_REGION` | `9007199254740992` | **Fluxer-specific**: change voice RTC region |
| 54 | `VIEW_CHANNEL_MEMBERS` | `18014398509481984` | **Fluxer-specific**: view channel member list |
