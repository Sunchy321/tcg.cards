import { Document, Schema } from 'mongoose';

import bcrypt from 'bcrypt';
import passportLocalMongoose from 'passport-local-mongoose';

import conn from './db';

const saltLength = 10;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
    },
    role: {
        type:     String,
        enum:     ['normal', 'admin'],
        required: true,
        default:  'normal'
    }
});

UserSchema.plugin(passportLocalMongoose);

UserSchema.methods.profile = function() {
    return {
        username: this.username,
        role:     this.role
    };
}

const User = conn.model('user', UserSchema);

export default User;