import { NextFunction } from "express";
import e from "express";
// Import Controllers
import { RouteType, MiddyPair, MiddyFunction } from "../decorators/routeType";
import { BaseController } from "./BaseController";
import { RouteOptions } from "../types/RouteOptions";
import { ErrorManager } from "../../utils/ErrorManager";
import { checkToken } from "../../utils/checkToken";
import { Request } from "../types/Request";
import { Constructable } from "../interfaces/Constructable";
import { Response } from "../types/Response";

/**
 * Refactor this class completely
 */
export class RouteAggregator {
    private app: e.Express;
    private debug: boolean;

    /**
     *
     * @param app Express App
     * @param debug Debug flag currently used to send missing fields to front-end on calls
     */
    constructor(app: e.Express, debug?: boolean) {
        this.app = app;
        this.debug = Boolean(debug);
        // Binding the correct prototype
        this.aggregateRoutes = this.aggregateRoutes.bind(this);
    }

    aggregateRoutes(controllers: Array<Constructable<BaseController>>): void {
        for (const controller of controllers) {
            const instance = new controller();

            // This is the route prefix ex. "/users"
            const prefix = Reflect.getMetadata("prefix", controller);
            const routes: Array<RouteType> = Reflect.getMetadata("routes", controller);

            const middlewares: Array<MiddyPair> = Reflect.getMetadata("middleware", controller);
            for (const route of routes) {
                const routeMiddleware = middlewares && middlewares.find((middy) => middy.method === route.methodName);
                let functions = new Array<MiddyFunction>();
                if (routeMiddleware != null) {
                    functions = routeMiddleware.functions;
                }

                if (route.routeOptions) functions = functions.concat(this.mapRequiredFields(route.routeOptions));

                if (route.routeOptions?.requireToken) {
                    functions = functions.concat(checkToken);
                }

                this.app[route.requestMethod](
                    (process.env.API_URL || "") + prefix + route.path,
                    ...functions,
                    (req: Request, res: Response, next: NextFunction) => {
                        const result = instance[route.methodName as string](req, res);
                        if (result instanceof Promise) {
                            result
                                .then((promiseValues) => this.formatResponse(promiseValues, res))
                                .catch((err) => next(err));
                        } else {
                            this.formatResponse(result, res);
                        }
                    }
                );
            }
        }
    }

    private mapRequiredFields(options: RouteOptions): MiddyFunction[] {
        const functions = new Array<MiddyFunction>();
        for (const key in options) {
            functions.push((req: Request, res: Response, next: NextFunction) => {
                const reqProp = Object.getOwnPropertyDescriptor(req, key);
                const missingFields = new Array<string>();

                if (reqProp != null && reqProp.value) {
                    for (const field of options[key].required) {
                        if (reqProp.value[field] == null) {
                            if (this.debug) missingFields.push(field);
                            else throw ErrorManager.errors.REQUIRED_FIELDS_EMPTY;
                        }
                    }
                }

                if (this.debug && missingFields.length > 0) throw ErrorManager.errors.FIELDS_EMPTY(key, missingFields);

                next();
            });
        }

        return functions;
    }

    private formatResponse(data: any, res: Response): void {
        let status = 200;
        const results: { [key: string]: any[] } = {};

        if (data) {
            for (const key in data) {
                if (key === "status") {
                    status = data[key];
                } else {
                    results[key] = data[key];
                }
            }
        }

        res.status(status).json(results);
    }
}
