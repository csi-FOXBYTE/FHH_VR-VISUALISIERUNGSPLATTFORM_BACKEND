
import { createService } from "@csi-foxbyte/fastify-toab";
import { createFormatter, createTranslator } from "use-intl";

import de from "./messages/de.json" with { type: "json"};
import en from "./messages/en.json" with { type: "json"};

const messages = {
    en,
    de
}

const translationService = createService("translation", async () => {
    return {
        getTranslator(locale: keyof typeof messages) {
            if (!messages[locale]) throw new Error(`No locale for ${locale} found!`);
            
            const translator = createTranslator<typeof en>({
                locale,
                messages: messages[locale],
            });

            return translator;
        },
        getFormatter(locale: keyof typeof messages) {
            const formatter = createFormatter({ locale, timeZone: "Europe/Berlin" });

            return formatter;
        }
    }
});

export default translationService;
