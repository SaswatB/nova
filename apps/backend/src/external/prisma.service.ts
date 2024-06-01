import { PrismaClient } from "@prisma/client";
import { container, singleton } from "tsyringe";

@singleton()
export class PrismaService extends PrismaClient {}
container.register(PrismaService, { useValue: new PrismaClient() });
