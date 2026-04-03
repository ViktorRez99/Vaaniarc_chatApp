const {
  buildDirectMessagePayload,
  buildRoomMessagePayload,
  getOfflineUserIds
} = require('../server/services/pushService');

describe('pushService', () => {
  it('builds privacy-safe payloads for secure direct and room messages', () => {
    expect(buildDirectMessagePayload({
      sender: { username: 'Aarav' },
      message: {
        protocolVersion: 3,
        encryptedContent: '{"version":3}',
        chatId: 'chat-1'
      }
    })).toMatchObject({
      title: 'VaaniArc',
      body: 'Open VaaniArc to read a new secure message.',
      url: '/chat',
      tag: 'dm:chat-1'
    });

    expect(buildRoomMessagePayload({
      sender: { username: 'Diya' },
      room: { _id: 'room-7', name: 'Project Team' },
      message: {
        fileUrl: '/uploads/file.bin'
      }
    })).toMatchObject({
      title: 'VaaniArc',
      body: 'Open VaaniArc to read new secure messages.',
      tag: 'room:room-7'
    });
  });

  it('detects offline users from socket rooms', async () => {
    const io = {
      sockets: {
        adapter: {
          rooms: new Map([
            ['user:user-1', new Set(['socket-a'])],
            ['user:user-3', new Set(['socket-b', 'socket-c'])]
          ])
        }
      }
    };

    await expect(getOfflineUserIds(io, ['user-1', 'user-2', 'user-3'])).resolves.toEqual(['user-2']);
  });
});
