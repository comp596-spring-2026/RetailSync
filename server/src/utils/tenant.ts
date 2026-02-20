import { FilterQuery, Model, PipelineStage } from 'mongoose';

export const tenantFilter = <T>(companyId: string, extra: FilterQuery<T> = {}) => ({
  companyId,
  ...extra
});

export const tenantAggregate = <T>(
  model: Model<T>,
  companyId: string,
  pipeline: PipelineStage[]
) => model.aggregate([{ $match: { companyId } }, ...pipeline]);
