import { Entity } from './entity';

export interface Action {

}

export interface CreateGame {
    game: Entity;
    players: [Entity, Entity];
}
