import { roles } from "../constants/index.js";
export const isOfficer = (req, res, next) => {
  const role = req?.session?.role;
  if (role != roles.officer) {
      return res.status(403).json({
        error: "Not authorized",
      });
  }
  next();
};

export const isReader = () => {
    const role = req?.session?.role;
    if(role != roles.reader){
        return res.status(403).json({
        error: "Not authorized",
      });
    }
    next();
}
