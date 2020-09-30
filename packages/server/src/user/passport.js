import passport from 'koa-passport';
import { Strategy as LocalStrategy } from 'passport-local';

import User from '~/db/user/user';

passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

export default passport;