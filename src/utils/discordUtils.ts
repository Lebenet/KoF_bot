import { Profession } from "../db/dbTypes";

export function getProfessions(): any[] {
    const ps = Profession.fetch();
    if (!ps)
        return [
            { name: "error:no_profession_found", value: "no_profession_found" },
        ];
    return (Array.isArray(ps) ? ps : [ps]).map((p) => {
        return { name: p.description, value: p.p_name };
    });
}
