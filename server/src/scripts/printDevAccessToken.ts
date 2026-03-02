import mongoose from 'mongoose';
import { env } from '../config/env';
import { UserModel } from '../models/User';
import { signAccessToken } from '../utils/jwt';

const run = async () => {
  await mongoose.connect(env.mongoUri);

  const user = await UserModel.findOne({ isActive: true }).select('_id email companyId roleId').lean();
  if (!user) {
    throw new Error('No active user found in Mongo. Log in once to create a user, then rerun.');
  }

  const token = signAccessToken({
    sub: user._id.toString(),
    email: String(user.email),
    companyId: user.companyId ? user.companyId.toString() : null,
    roleId: user.roleId ? user.roleId.toString() : null
  });

  // Print only the token (easy to copy into curl)
  // eslint-disable-next-line no-console
  console.log(token);

  await mongoose.disconnect();
};

run().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

