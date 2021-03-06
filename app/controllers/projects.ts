import { BaseController } from "../../../MunchiJS/src/BaseController";
import { Controller } from "../../../MunchiJS/src/decorators/controller";
import { Get, Post, Put, Delete } from "../../../MunchiJS/src/decorators/verbs";
import { Request } from "../../../MunchiJS/src/types/Request";
import Project, { Tag } from "../models/Project";
import Workspace from "../models/Workspace";
import { ErrorManager } from "../../../MunchiJS/src/ErrorManager";
import ObjectId from "../../../MunchiJS/src/database/mongo/ObjectId";

@Controller("/projects")
export class ProjectController extends BaseController {
    @Get("/", { requireToken: true, headers: { required: ["workspace"] } })
    public async getProjects(req: Request): Promise<object> {
        const {
            headers: { workspace },
        } = req;

        //Add verification to check if user belongs to provided workspace
        const projects = await Workspace.find({ _id: workspace })
            .populate({
                path: "projects",
                populate: {
                    path: "columns.tasks",
                    model: "Task",
                },
            })
            .populate({ path: "users " });

        return { projects: projects[0].projects };
    }

    @Get("/:id", { requireToken: true, params: { required: ["id"] } })
    public async getProject(req: Request): Promise<object> {
        const {
            params: { id },
        } = req;

        let project = null;
        try {
            project = await Project.aggregate([
                { $match: { _id: id as ObjectId } },
                {
                    $lookup: {
                        from: "tasks",
                        localField: "columns.tasks",
                        foreignField: "_id",
                        as: "columns.tasks",
                    },
                },
            ]);
        } catch (err) {
            throw ErrorManager.errors.NOT_FOUND;
        }

        return { project };
    }

    @Get("/:id/tags", { requireToken: true, params: { required: ["id"] } })
    public async getProjectTags(req: Request): Promise<object> {
        const {
            params: { id },
        } = req;

        let tags = null;
        try {
            tags = await Project.findOne({ _id: id }, "-_id tags").lean();
        } catch (err) {
            throw ErrorManager.errors.NOT_FOUND;
        }
        return { tags: tags?.tags };
    }

    @Post("/:id/tags", {
        requireToken: true,
        params: { required: ["id"] },
    })
    public async postProjectTags(req: Request): Promise<object> {
        const {
            params: { id },
            body: { name, colour },
        } = req;

        const updatedWorkSpace = await Project.findOneAndUpdate(
            { _id: id },
            {
                $push: { tags: new Tag(name, colour) },
            },
            {
                new: true,
            }
        );

        return { status: 201, tags: updatedWorkSpace?.tags };
    }

    @Post("/", {
        requireToken: true,
        headers: { required: ["workspace"] },
        body: { required: ["title"] },
    })
    public async postProject(req: Request): Promise<object> {
        const {
            headers: { workspace },
            body: { title },
            user,
        } = req;

        if (!user) throw ErrorManager.errors.BAD_REQUEST;

        const workspaceObj = await Workspace.findOne({ _id: new ObjectId(workspace) });
        const userEntry = workspaceObj?.users.find((usrEntry) => String(usrEntry.user) == String(user._id));
        const users = [{ user: user._id, roles: userEntry?.roles }];
        const project = await new Project({ title, users }).save();

        await Workspace.findOneAndUpdate({ _id: new ObjectId(workspace) }, { $push: { projects: project } });

        return { status: 201, project };
    }

    @Put("/:id/tags", {
        requireToken: true,
        params: { required: ["id"] },
    })
    public async putProjectTags(req: Request): Promise<object> {
        const {
            params: { id },
            body: { tagId },
        } = req;

        const query: { [index: string]: any } = {};
        for (const key in req.body) {
            query[`tags.$.${key}`] = req.body[key];
        }

        const updatedWorkSpace = await Project.findOneAndUpdate(
            {
                _id: id,
                tags: { $elemMatch: { _id: tagId } },
            },
            {
                $set: { ...query },
            },
            {
                new: true,
            }
        );

        if (!updatedWorkSpace) throw ErrorManager.errors.NOT_FOUND;

        return { status: 201, tags: updatedWorkSpace?.tags };
    }

    @Put("/:id", {
        requireToken: true,
        params: { required: ["id"] },
    })
    public async editProject(req: Request): Promise<object> {
        const {
            params: { id },
            body,
        } = req;

        console.log("Im here ", body);

        const updatedProject = await Project.findOneAndUpdate({ _id: id }, body, { new: true }).populate(
            "columns.tasks"
        );

        return { project: updatedProject };
    }

    @Delete("/:id/tags", {
        requireToken: true,
        params: { required: ["id"] },
    })
    public async postdeleteTag(req: Request): Promise<object> {
        const {
            params: { id },
            body: { tagId },
        } = req;

        const updatedWorkSpace = await Project.findOneAndUpdate(
            { _id: id },
            {
                $pull: { tags: { _id: tagId } },
            },
            {
                new: true,
            }
        );

        return { status: 201, tags: updatedWorkSpace?.tags };
    }

    @Delete("/:id", { requireToken: true, headers: { required: ["workspace"] } })
    public async deleteProject(req: Request): Promise<void> {
        const {
            headers: { workspace },
            params: { id },
            user,
        } = req;

        const workspaceObj = await Workspace.aggregate([
            { $match: { projects: new ObjectId(id) } },
            {
                $lookup: {
                    from: "roles",
                    localField: "users.role",
                    foreignField: "_id",
                    as: "users.role",
                },
            },
            { $match: { $and: [{ "users.user": user?._id }, { "users.role.isOwner": true }] } },
        ]);

        if (!workspaceObj) throw ErrorManager.errors.NO_PERMISSION;

        try {
            await Project.findOneAndDelete({ _id: id });
        } catch (err) {
            throw ErrorManager.errors.BAD_REQUEST;
        }
    }
}
