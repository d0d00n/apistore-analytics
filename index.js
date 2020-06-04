const express = require('express');
const axios = require('axios');

var moment = require('moment');


const port = process.env.PORT || 8080;
const domain = process.env.DOMAIN || 'api.canada.ca';
const app = express();

var tenants = process.env.TENANTS.split(' ');

app.get("/", async (req, res) => {
    // params: date start, date finish, frequency, unpublished
    // assumption: date start blank == April 2, 2019; date finish blank = now; 
    //             frequency blank = month; unpublished blank = false;
    let startDate = req.query.startDate || '2019-04-02';
    let endDate = req.query.endDate || moment().format('YYYY-MM-DD');
    let frequency = req.query.frequency || 'month';
    let unpublished = (req.query.unpublished === 'true') || false;
    var servicePromises = [];
    var activeDocsPromises = [];
    // setup promises for grabbing all the data
    for (let tenantName of tenants) {
        let serviceIds = [];
        let accessToken = process.env[tenantName];
        servicePromises.push(axios.get(`https://${tenantName}-admin.${domain}/admin/api/services.json?access_token=${accessToken}`));

        if (!unpublished) {
            // we will get activedocs and see who has en and fr both published, then capture their system_name so we can pull those from the service list
            activeDocsPromises.push(axios.get(`https://${tenantName}-admin.${domain}/admin/api/active_docs.json?access_token=${accessToken}`));

        }
    }
    let servicesToShow = [];
    if (!unpublished) {
        // gotta grab activedocs first to make them available for consumption by next promise chain
        await axios.all(activeDocsPromises).then(function (results) {
            results.forEach(function (response) {
                // this map takes advantage of fact that system_name is unique
                let systemNameMap = new Map();
                for (var anApidoc of response.data.api_docs) {
                    let apidocs = anApidoc.api_doc;
                    let systemName = apidocs.system_name.substring(0, apidocs.system_name.length - 3);
                    let suffix = apidocs.system_name.substring(apidocs.system_name.length - 2, apidocs.system_name.length);
                    if (suffix === "en" || suffix == "fr") {
                        if (systemNameMap.has(systemName + ';' + apidocs.service_id)) {
                            systemNameMap.set(systemName + ';' + apidocs.service_id, systemNameMap.get(systemName + ';' + apidocs.service_id) + 1);
                        }
                        else {
                            systemNameMap.set(systemName + ';' + apidocs.service_id, 1);
                        }
                    }
                }
                for (let key of systemNameMap.keys()) {
                    if (systemNameMap.get(key) == 2) {
                        servicesToShow.push(key);
                    }
                }
            });
        });

    }

    // get all the services
    var analyticsPromises = [];
    await axios.all(servicePromises).then(function (results) {
        results.forEach(function (response) {
            for (let service of response.data.services) {
                // guh, build URL from one of the links
                let found = true;
                if (!unpublished) {
                    // make sure we care about this
                    found = false;
                    for (let serviceToShow of servicesToShow) {
                        let keySplit = serviceToShow.split(';');
                        if (service.service.system_name == keySplit[0] && service.service.id == keySplit[1]) {
                            found = true;
                            break;

                        }
                    }
                }
                if (found) {
                    let hostname = service.service.links[0].href.split('/admin')[0];
                    let tenantName = hostname.split('//')[1].split('-admin')[0];
                    let accessToken = process.env[tenantName];
                    analyticsPromises.push(axios.get(`${hostname}/stats/services/${service.service.id}/usage.json?access_token=${accessToken}&metric_name=hits&skip_change=true&since=${startDate}&until=${endDate}&granularity=${frequency}`));
                }

            }

        });
    });

    // get all the analytics for the services
    var totalHits = 0;
    await axios.all(analyticsPromises).then(function (results) {
        results.forEach(function (response) {
            // for now, just do total. we'll do something smarter another day
            totalHits += response.data.total;
        });

    });

    res.json({ hits: totalHits });

});


app.listen(port, function () {
    console.log(`App started on ${port}`);
});