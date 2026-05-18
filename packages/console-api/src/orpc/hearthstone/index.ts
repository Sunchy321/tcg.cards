import { announcementTrpc } from './announcement';
import { setTrpc } from './set';
import { tagTrpc } from './tag';
import { imageTrpc } from './image';

export const hearthstoneLight = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
};

export const hearthstoneMedium = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	image:        imageTrpc,
};

export const hearthstoneFull = {
	announcement: announcementTrpc,
	set:          setTrpc,
	tag:          tagTrpc,
	image:        imageTrpc,
};
