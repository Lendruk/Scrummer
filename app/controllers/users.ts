import { ErrorManager } from "../lib/classes/ErrorManager";
import { Controller } from "../lib/decorators/controller";
import { Get, Post, Put } from "../lib/decorators/verbs";
import { BaseController } from "../lib/classes/BaseController";
import User from "../models/user";
import bcrypt from "bcryptjs";
import { Request } from "../lib/types/Request";
import { Response } from "express";
import { View } from "../lib/decorators/ViewHandler";

@Controller("/users")
export class UserController extends BaseController {
    @Get("/")
    public async getUsers(req: Request): Promise<object> {
        console.log("body", req.body);
        const t = new User({ name: "test", role: "test" });
        return { good: "Boost" };
    }

    @View("Home")
    @Get("/test")
    public testTemplate(req: Request, res: Response): object {
        return {
            test: 23,
            city: "Berlin",
            user: { name: "James", address: { street: "Rua da laranja" } },
        };
    }

    @Get("/:id", { requireToken: true })
    public async getUser(req: Request): Promise<object> {
        const {
            params: { id },
        } = req;
        let user;
        try {
            user = await User.findOne({ _id: id });
        } catch (err) {
            throw ErrorManager.errors.NOT_FOUND;
        }
        return { user: user?.getPublicInformation() };
    }

    @Put("/:id", { requireToken: true })
    public async putUser(req: Request) {
        const {
            body,
            params: { id },
        } = req;
        let user;
        try {
            user = await User.findOneAndUpdate({ _id: id }, body, { new: true });
        } catch {
            throw ErrorManager.errors.BAD_REQUEST;
        }
        return { user: user?.getPublicInformation() };
    }

    @Post("/register", { body: { required: ["password", "email", "name"] } })
    public async registerUser(req: Request) {
        const {
            body: { name, password, email },
            headers,
        } = req;
        if (await User.findOne({ email: email })) {
            throw ErrorManager.errors.EMAIL_ALREADY_IN_USE;
        }
        const newUser = await new User({ name, password: await this.hashPassword(password), email }).save();
        return {
            status: 201,
            code: "USER_REGISTERED",
            message: "Account successfully created",
            user: newUser.getPublicInformation(),
        };
    }

    private async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        return hash;
    }
}
