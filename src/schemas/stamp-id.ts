import { z } from 'zod';
import { STAMP_IDS } from '../constants/zanzar-categories.js';

export const stampIdSchema = z.enum(STAMP_IDS);
