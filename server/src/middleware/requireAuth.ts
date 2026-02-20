import { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/apiResponse';
import { verifyAccessToken } from '../utils/jwt';
import { UserModel } from '../models/User';
import { setRequestContext } from '../config/requestContext';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return fail(res, 'Unauthorized', 401);
    }

    const token = auth.slice('Bearer '.length);
    const payload = verifyAccessToken(token);
    const user = await UserModel.findById(payload.sub).select('_id email companyId roleId isActive');

    if (!user || !user.isActive) {
      return fail(res, 'Unauthorized', 401);
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      companyId: user.companyId ? user.companyId.toString() : null,
      roleId: user.roleId ? user.roleId.toString() : null
    };
    if (req.user.companyId) {
      req.companyId = req.user.companyId;
    }
    req.roleId = req.user.roleId ?? undefined;
    setRequestContext({
      tenantId: req.user.companyId ?? undefined,
      userId: req.user.id
    });
    return next();
  } catch {
    return fail(res, 'Unauthorized', 401);
  }
};
