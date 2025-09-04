import { Entity, PrimaryColumn, Column, Index } from "typeorm";

@Entity()
export class Question {
    @PrimaryColumn({
        nullable: false,
        unique: true,
        type: 'varchar',
        length: 255,
    })
    @Index()
    uid: string;

    @Column({
        length: 10000,
    })
    json: string;
}