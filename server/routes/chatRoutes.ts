import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();

const ensurePrisma = (req: any, res: any, next: any) => {
  if (!req.prisma) {
    return res.status(500).json({ error: 'Database connection not available' });
  }
  next();
};

router.use(ensurePrisma);

// Create or get private chat between two users
router.post('/private', async (req: any, res) => {
  const { userId, targetUserId } = req.body;
  const prisma: PrismaClient = req.prisma;

  if (!userId || !targetUserId) {
    return res.status(400).json({ error: 'Both user IDs are required' });
  }

  try {
    // Check if chat already exists
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'PRIVATE',
        AND: [
          { participants: { some: { id: userId } } },
          { participants: { some: { id: targetUserId } } }
        ]
      },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (existingChat) {
      return res.json(existingChat);
    }

    // Create new chat
    const newChat = await prisma.chat.create({
      data: {
        type: 'PRIVATE',
        participants: {
          connect: [{ id: userId }, { id: targetUserId }]
        }
      },
      include: {
        participants: true
      }
    });

    res.json(newChat);
  } catch (error: any) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Get user chats
router.get('/user/:userId', async (req: any, res) => {
  const { userId } = req.params;
  const prisma: PrismaClient = req.prisma;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: { id: userId }
        }
      },
      include: {
        participants: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isOnline: true,
            lastSeen: true,
            color: true
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: { messages: true }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    res.json(chats);
  } catch (error: any) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Get chat messages
router.get('/:chatId/messages', async (req: any, res) => {
  const { chatId } = req.params;
  const prisma: PrismaClient = req.prisma;

  try {
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
            color: true
          }
        }
      }
    });

    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
