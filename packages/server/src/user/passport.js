import passport from 'koa-passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';

import User from '~/db/user/user';

passport.use(new LocalStrategy(async (username, password, done) => {
    const user = await User.login(username, password);

    if (user != null) {
        return done(null, user);
    } else {
        return done(null, false);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.username);
});

passport.deserializeUser(async (username, done) => {
    const user = await User.findOne({ username }).exec();

    return done(null, user);
});

export default passport;