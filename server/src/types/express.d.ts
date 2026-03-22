import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        companyId: string | null;
        roleId: string | null;
      };
      companyId?: string;
      roleId?: string;
    }
  }
}

export type ObjectId = Types.ObjectId;
