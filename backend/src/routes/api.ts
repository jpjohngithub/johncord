import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middlewares/auth';
import { authController } from '../controllers/authController';
import { serverController } from '../controllers/serverController';
import { channelController } from '../controllers/channelController';
import { roleController } from '../controllers/roleController';
import { messageController } from '../controllers/messageController';
import { friendController } from '../controllers/friendController';

const router = Router();

// Multer file upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Auth Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/guest', authController.quickGuest);
router.get('/auth/me', authMiddleware, authController.getMe);
router.patch('/auth/profile', authMiddleware, authController.updateProfile);

// Server Routes
router.get('/servers', authMiddleware, serverController.getMyServers);
router.post('/servers', authMiddleware, serverController.createServer);
router.get('/servers/:serverId', authMiddleware, serverController.getServerDetails);
router.patch('/servers/:serverId', authMiddleware, serverController.updateServer);
router.delete('/servers/:serverId', authMiddleware, serverController.deleteServer);
router.post('/servers/join', authMiddleware, serverController.joinByInvite);
router.post('/servers/:serverId/leave', authMiddleware, serverController.leaveServer);

// Category Routes
router.post('/servers/:serverId/categories', authMiddleware, channelController.createCategory);
router.patch('/categories/:categoryId', authMiddleware, channelController.updateCategory);
router.delete('/categories/:categoryId', authMiddleware, channelController.deleteCategory);

// Channel Routes
router.post('/servers/:serverId/channels', authMiddleware, channelController.createChannel);
router.patch('/channels/:channelId', authMiddleware, channelController.updateChannel);
router.delete('/channels/:channelId', authMiddleware, channelController.deleteChannel);

// Role Routes
router.get('/servers/:serverId/roles', authMiddleware, roleController.getRoles);
router.post('/servers/:serverId/roles', authMiddleware, roleController.createRole);
router.patch('/roles/:roleId', authMiddleware, roleController.updateRole);
router.delete('/roles/:roleId', authMiddleware, roleController.deleteRole);
router.post('/roles/assign', authMiddleware, roleController.assignRole);
router.post('/roles/remove', authMiddleware, roleController.removeRole);

// Message Routes
router.get('/channels/:channelId/messages', authMiddleware, messageController.getChannelMessages);
router.get('/dms/:dmId/messages', authMiddleware, messageController.getDMMessages);
router.get('/threads/:threadParentId/messages', authMiddleware, messageController.getThreadMessages);
router.post('/messages/:messageId/threads', authMiddleware, messageController.createThread);
router.post('/messages', authMiddleware, messageController.sendMessage);
router.patch('/messages/:messageId', authMiddleware, messageController.editMessage);
router.delete('/messages/:messageId', authMiddleware, messageController.deleteMessage);
router.post('/messages/:messageId/reactions', authMiddleware, messageController.toggleReaction);
router.post('/messages/:messageId/pin', authMiddleware, messageController.togglePin);
router.post('/upload', authMiddleware, upload.single('file'), messageController.uploadFile);

// Friend & DM Routes
router.get('/friends', authMiddleware, friendController.getFriends);
router.post('/friends/request', authMiddleware, friendController.sendFriendRequest);
router.post('/friends/:friendshipId/accept', authMiddleware, friendController.acceptFriendRequest);
router.delete('/friends/:friendshipId', authMiddleware, friendController.rejectFriendRequest);
router.get('/dms', authMiddleware, friendController.getDMConversations);
router.post('/dms', authMiddleware, friendController.getOrCreateDM);

export default router;
