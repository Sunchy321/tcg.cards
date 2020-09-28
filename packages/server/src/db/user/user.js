import { Document, Schema } from 'mongoose';

import bcrypt from 'bcrypt';

import conn from './db';
import passport from '~/user/passport';

const saltLength = 10;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    permission: {
        type:     String,
        enum:     ['normal', 'admin'],
        required: true,
        default:  'normal'
    }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(saltLength);
    this.password = await bcrypt.hash(this.password, salt);

    return next();
});

UserSchema.statics.register = async function(username, password) {
    const user = await this.findOne({ username }).exec();

    if (user != null) {
        return null;
    } else {
        return await this.create({ username, password });
    }
}

UserSchema.statics.login = async function (username, password) {
    const user = await this.findOne({ username }).exec();

    if (user != null) {
        if (bcrypt.compareSync(passport, user.password)) {
            return user;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

const User = conn.model('user', UserSchema);

export default User;