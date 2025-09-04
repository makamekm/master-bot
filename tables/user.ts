import { Entity, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class User {
    @PrimaryColumn({
        nullable: false,
        unique: true,
        type: 'varchar',
        length: 100,
    })
    @Index()
    uid: string;

    @Column()
    @Index()
    id: string;

    @Column()
    @Index()
    type: string;

    @Column({
        nullable: true,
        type: 'varchar',
        length: 100,
    })
    step?: string;
}