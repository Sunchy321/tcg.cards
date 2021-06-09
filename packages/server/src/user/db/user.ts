import { Document, Model, Schema } from 'mongoose';

import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

import conn from './db';

import { config } from '@static';

interface IUserInfo {
    username: string;
    role: string;
}

interface IUserProfile {
    username: string;
    role: string;
}

export interface IUser extends Document {
    username: string;

    role: 'normal' | 'admin';

    salt: string;
    hash: string;

    lastLogin: number;
    attempts: number;

    setPassword(password: string): void;
    changePassword(oldPassword: string, newPassword: string): Promise<void>;
    authenticate(password: string): void;
    resetAttempts(): Promise<void>;

    info(): IUserInfo;
    isAdmin(): boolean;
    profile(): IUserProfile;
}

interface UserModel extends Model<IUser> {
    authenticate(username: string, password: string): Promise<IUser>;
    register(username: string, password: string): Promise<IUser>;
    findByUsername(username: string): Promise<IUser>;

    toJwtToken(user: IUser): string;
    fromJwtToken(token: string): Promise<IUser>
}

const UserSchema = new Schema<IUser>({
    username: {
        type:     String,
        required: true,
        unique:   true,
    },

    role: {
        type:     String,
        enum:     ['normal', 'admin'],
        required: true,
        default:  'normal',
    },

    salt: String,
    hash: String,

    lastLogin: {
        type:    Number,
        default: Date.now(),
    },
    attempts: {
        type:    Number,
        default: 0,
    },
});

const saltlen = 32;
const iterations = 25000;
const keylen = 512;
const encoding = 'hex';
const digest = 'sha256';
const maxAttempts = 10;
const interval = 100;
const maxInterval = 50000;

function passwordValidator(password: string) {
    if (password.length < 8) {
        throw new Error('password_to_short');
    }

    if (!/\d/.test(password)) {
        throw new Error('password_no_digit');
    }

    if (!/[a-z]/.test(password)) {
        throw new Error('password_no_lower_case');
    }

    if (!/[A-Z]/.test(password)) {
        throw new Error('password_no_upper_case');
    }

    if (!/[^0-9a-zA-Z]/.test(password)) {
        throw new Error('password_no_special_character');
    }
}

async function authenticate(user: IUser, password: string) {
    const attemptsInterval = Math.pow(interval, Math.log(user.attempts + 1));
    const calculatedInterval = attemptsInterval < maxInterval ? attemptsInterval : maxInterval;

    if (Date.now() - user.lastLogin < calculatedInterval) {
        user.lastLogin = Date.now();

        await user.save();

        throw new Error('attempt_too_soon');
    }

    if (user.attempts >= maxAttempts) {
        throw new Error('too_many_attempts');
    }

    if (user.salt == null) {
        throw new Error('no_salt_stored');
    }

    const hashBuffer = pbkdf2Sync(password, user.salt, iterations, keylen, digest);

    if (timingSafeEqual(hashBuffer, Buffer.from(user.hash, encoding))) {
        user.lastLogin = Date.now();
        user.attempts = 0;

        await user.save();
    } else {
        user.lastLogin = Date.now();
        user.attempts += 1;

        await user.save();

        if (user.attempts >= maxAttempts) {
            throw new Error('too_many_attempts');
        } else {
            throw new Error('incorrect_name_or_password');
        }
    }
}

UserSchema.methods.setPassword = function(this: IUser, password: string) {
    if (password == null) {
        throw new Error('missing_password');
    }

    passwordValidator(password);

    const salt = randomBytes(saltlen).toString(encoding);

    this.salt = salt;

    const hashBuffer = pbkdf2Sync(password, salt, iterations, keylen, digest);

    this.hash = hashBuffer.toString(encoding);
};

UserSchema.methods.changePassword = async function(this: IUser, oldPassword: string, newPassword: string) {
    if (oldPassword == null || newPassword == null) {
        throw new Error('missing_password');
    }

    this.authenticate(oldPassword);
    this.setPassword(newPassword);
    await this.save();
};

UserSchema.methods.authenticate = function(this: IUser, password: string) {
    if (this.salt == null) {
        throw new Error('incorrect_name_or_password');
    }

    authenticate(this, password);
};

UserSchema.methods.resetAttempts = async function(this: IUser) {
    this.attempts = 0;
    await this.save();
};

UserSchema.methods.info = function(this: IUser): IUserInfo {
    return {
        username: this.username,
        role:     this.role,
    };
};

UserSchema.methods.isAdmin = function(this: IUser): boolean {
    return this.role === 'admin';
};

UserSchema.methods.profile = function(this: IUser): IUserProfile {
    return {
        username: this.username,
        role:     this.role,
    };
};

UserSchema.statics.authenticate = async function(this: UserModel, username: string, password: string) {
    const user = await this.findByUsername(username);

    if (user == null) {
        throw new Error('incorrect_name_or_password');
    }

    user.authenticate(password);

    return user;
};

UserSchema.statics.register = async function(this: UserModel, username: string, password: string) {
    const oldUser = await this.findByUsername(username);

    if (oldUser != null) {
        throw new Error('user_already_exists');
    }

    const user = new User({ username });

    user.setPassword(password);

    await user.save();

    return user;
};

UserSchema.statics.findByUsername = async function(this: UserModel, username: string) {
    return this.findOne({ username });
};

UserSchema.statics.toJwtToken = function(this: UserModel, user: IUser) {
    return jwt.sign(user.info(), config.jwtSecretKey, {
        expiresIn: '7d',
    });
};

UserSchema.statics.fromJwtToken = async function(this: UserModel, token: string) {
    try {
        const payload = jwt.verify(token, config.jwtSecretKey) as IUserInfo;

        return this.findByUsername(payload.username);
    } catch (e) {
        return null;
    }
};

const User = conn.model<IUser, UserModel>('user', UserSchema);

export default User;
