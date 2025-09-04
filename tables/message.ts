import { Entity, PrimaryColumn, Column, Index } from "typeorm";

@Entity()
export class Message {
    @PrimaryColumn({
        nullable: false,
        unique: true,
        type: 'varchar',
        length: 255,
    })
    @Index()
    uid: string;

    @Column()
    @Index()
    id: string;

    @Column()
    @Index()
    chatId: string;

    @Column()
    @Index()
    type: string;
}