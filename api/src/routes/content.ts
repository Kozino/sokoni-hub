import { Router } from 'express';
import { DEFAULT_CONTACT, publicPayload } from '../content';

export const contentRouter = Router();

contentRouter.get('/', async (_req, res) => {
  try {
    res.json(await publicPayload());
  } catch {
    // Never 500 the storefront: web and the app keep their bundled legal copy.
    res.json({ contact: DEFAULT_CONTACT, announcement: null, documents: {} });
  }
});
