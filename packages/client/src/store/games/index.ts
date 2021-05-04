import magic, { Module as Magic } from './magic';
import hearthstone, { Module as Hearthstone } from './hearthstone';

export type Modules = {
    magic: Magic,
    hearthstone: Hearthstone
}

export default {
    magic,
    hearthstone,
};
