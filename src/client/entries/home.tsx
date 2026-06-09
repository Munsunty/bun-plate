import { bootPage } from "../boot";
import Home from "../../pages/home";

// Client entry for the home route. Statically importing Home keeps it in this
// page's initial bundle (fast first hydrate); other pages load on demand.
void bootPage(Home);
