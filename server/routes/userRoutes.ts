import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();

// Middleware to ensure Prisma is available
const ensurePrisma = (req: any, res: any, next: any) => {
  if (!req.prisma) {
    return res.status(500).json({ error: 'Database connection not available' });
  }
  next();
};

router.use(ensurePrisma);

// Search users by phone number or username
router.get('/search', async (req: any, res) => {
  const { query } = req.query;
  const prisma: PrismaClient = req.prisma;

  if (!query || typeof query !== 'string' || query.length < 3) {
    return res.status(400).json({ error: 'Search query must be at least 3 characters' });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { phoneNumber: { contains: query } },
          { username: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        avatarUrl: true,
        isOnline: true,
        lastSeen: true,
        bio: true,
        color: true
      },
      take: 20
    });

    res.json(users);
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get user profile by ID
router.get('/:id', async (req: any, res) => {
  const { id } = req.params;
  const prisma: PrismaClient = req.prisma;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        avatarUrl: true,
        isOnline: true,
        lastSeen: true,
        bio: true,
        color: true
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/profile', async (req: any, res) => {
  const { userId, firstName, lastName, bio, username, color } = req.body;
  const prisma: PrismaClient = req.prisma;

  if (!userId) return res.status(400).json({ error: 'User ID required' });

  try {
    // Check if username is taken (if changing)
    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        bio,
        username,
        color
      }
    });

    res.json(updatedUser);
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Add contact
router.post('/contacts', async (req: any, res) => {
  const { ownerId, contactUserId, firstName, lastName } = req.body;
  const prisma: PrismaClient = req.prisma;

  try {
    const contact = await prisma.contact.create({
      data: {
        ownerId,
        contactUserId,
        firstName,
        lastName
      },
      include: {
        contactUser: true
      }
    });
    res.json(contact);
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Contact already exists' });
    }
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Get contacts
router.get('/:userId/contacts', async (req: any, res) => {
  const { userId } = req.params;
  const prisma: PrismaClient = req.prisma;

  try {
    const contacts = await prisma.contact.findMany({
      where: { ownerId: userId },
      include: {
        contactUser: {
          select: {
            id: true,
            username: true,
            phoneNumber: true,
            avatarUrl: true,
            isOnline: true,
            lastSeen: true,
            color: true
          }
        }
      }
    });
    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

export default router;
