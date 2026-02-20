import { inventoryMoveSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { InventoryLedgerModel } from '../models/InventoryLedger';
import { ItemModel } from '../models/Item';
import { LocationModel } from '../models/Location';
import { fail, ok } from '../utils/apiResponse';

export const moveInventory = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user) return fail(res, 'Company onboarding required', 403);

  const parsed = inventoryMoveSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const [item, fromLocation, toLocation] = await Promise.all([
    ItemModel.findOne({ _id: parsed.data.itemId, companyId: req.companyId }),
    LocationModel.findOne({ companyId: req.companyId, code: parsed.data.fromLocationCode }),
    LocationModel.findOne({ companyId: req.companyId, code: parsed.data.toLocationCode })
  ]);

  if (!item) return fail(res, 'Item not found', 404);
  if (!fromLocation || !toLocation) return fail(res, 'Invalid location code(s)', 404);
  if (fromLocation._id.toString() === toLocation._id.toString()) {
    return fail(res, 'Source and destination location must be different', 400);
  }

  const moveEvent = await InventoryLedgerModel.create({
    companyId: req.companyId,
    itemId: item._id,
    fromLocationId: fromLocation._id,
    toLocationId: toLocation._id,
    type: 'move',
    qty: parsed.data.qty,
    notes: parsed.data.notes ?? '',
    referenceType: 'manual_move',
    createdBy: req.user.id
  });

  return ok(res, moveEvent, 201);
};

export const stockByLocation = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const rawCode = req.params.code;
  const codeValue = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const code = codeValue?.trim();
  if (!code) return fail(res, 'Location code is required', 400);

  const location = await LocationModel.findOne({ companyId: req.companyId, code });
  if (!location) return fail(res, 'Location not found', 404);

  const locationId = new mongoose.Types.ObjectId(location._id.toString());

  const rows = await InventoryLedgerModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.companyId),
        $or: [{ fromLocationId: locationId }, { toLocationId: locationId }]
      }
    },
    {
      $project: {
        itemId: 1,
        delta: {
          $add: [
            {
              $cond: [{ $eq: ['$toLocationId', locationId] }, '$qty', 0]
            },
            {
              $multiply: [{ $cond: [{ $eq: ['$fromLocationId', locationId] }, '$qty', 0] }, -1]
            }
          ]
        }
      }
    },
    {
      $group: {
        _id: '$itemId',
        qty: { $sum: '$delta' }
      }
    },
    {
      $match: {
        qty: { $ne: 0 }
      }
    },
    {
      $lookup: {
        from: 'items',
        localField: '_id',
        foreignField: '_id',
        as: 'item'
      }
    },
    { $unwind: '$item' },
    {
      $project: {
        _id: 0,
        itemId: '$item._id',
        barcode: '$item.barcode',
        upc: '$item.upc',
        description: '$item.description',
        department: '$item.department',
        qty: 1
      }
    },
    { $sort: { description: 1 } }
  ]);

  return ok(res, {
    location,
    items: rows
  });
};
