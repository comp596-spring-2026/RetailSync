import { locationCreateSchema, locationUpdateSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { LocationModel } from '../models/Location';
import { fail, ok } from '../utils/apiResponse';

export const listLocations = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const locations = await LocationModel.find({ companyId: req.companyId }).sort({ code: 1 });
  return ok(res, locations);
};

export const createLocation = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = locationCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const exists = await LocationModel.exists({ companyId: req.companyId, code: parsed.data.code });
  if (exists) return fail(res, 'Location code already exists', 409);

  const location = await LocationModel.create({ companyId: req.companyId, ...parsed.data });
  return ok(res, location, 201);
};

export const updateLocation = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const location = await LocationModel.findOneAndUpdate(
    { _id: req.params.id, companyId: req.companyId },
    { $set: parsed.data },
    { new: true }
  );
  if (!location) return fail(res, 'Location not found', 404);

  return ok(res, location);
};

export const deleteLocation = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const location = await LocationModel.findOneAndDelete({ _id: req.params.id, companyId: req.companyId });
  if (!location) return fail(res, 'Location not found', 404);

  return ok(res, { deleted: true });
};
