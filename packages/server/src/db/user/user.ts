import { PassportLocalDocument, PassportLocalModel, Schema } from 'mongoose';

import passportLocalMongoose from 'passport-local-mongoose';

import conn from './db';

export interface IUser extends PassportLocalDocument {
    username: string;
    password: string;
    role: 'normal' | 'admin';

    profile(): {
        username: string;
        role: string;
    };

    isAdmin(): boolean;
}

const UserSchema = new Schema({
    username: {
        type:     String,
        required: true,
        unique:   true,
    },
    password: {
        type: String,
    },
    role: {
        type:     String,
        enum:     ['normal', 'admin'],
        required: true,
        default:  'normal',
    },
});

UserSchema.plugin(passportLocalMongoose);

UserSchema.methods.profile = function () {
    return {
        username: this.username,
        role:     this.role,
    };
};

UserSchema.methods.isAdmin = function () {
    return this.role === 'admin';
};

const User = conn.model<IUser>('user', UserSchema) as PassportLocalModel<IUser>;

export default User;
