const express = require('express');
const axios = require('axios');

var moment = require('moment');


const port =  process.env.PORT || 8080;
const domain = process.env.DOMAIN || 'api.canada.ca';
const app = express();

var tenants = process.env.TENANTS.split(' ');

app.get("/",  async (req, res) => {
    // params: date start, date finish, frequency, unpublished
    // assumption: date start blank == April 2, 2019; date finish blank = now; 
    //             frequency blank = month; unpublished blank = false;
    let startDate = req.query.startDate || '2019-04-02';
    let endDate = req.query.endDate || moment().format('YYYY-MM-DD');
    let frequency = req.query.frequency || 'month';
    let unpublished = req.query.unpublished || false;
    var servicePromises = [];
    // setup promises for grabbing all the data
    for (let tenantName of tenants){
        let serviceIds = [];
        if (unpublished){
            // easy. get everything
            let accessToken = process.env[tenantName];
            servicePromises.push(axios.get(`https://${tenantName}-admin.${domain}/admin/api/services.json?access_token=${accessToken}`));
        }
        else{
            // hard. get activedocs and see who has en and fr both published
        }
    }

    // get all the services
    var analyticsPromises = [];
    await axios.all(servicePromises).then(function(results){
        if (unpublished){
            results.forEach(function(response){
                for (var service of response.data.services){
                    // guh, build URL from one of the links
                    let hostname = service.service.links[0].href.split('/admin')[0];
                    let tenantName = hostname.split('//')[1].split('-admin')[0];
                    let accessToken = process.env[tenantName];
                    analyticsPromises.push(axios.get(`${hostname}/stats/services/${service.service.id}/usage.json?access_token=${accessToken}&metric_name=hits&skip_change=true&since=${startDate}&until=${endDate}&granularity=${frequency}`));
                }

            });

        }
        else{

        }

    });

    // get all the analytics for the services
    var totalHits = 0;
    await axios.all(analyticsPromises).then(function(results){
        results.forEach(function(response){
            totalHits += response.data.total;
        });

    });

    res.json({ hits: totalHits});

});


app.listen(port,function(){
    console.log(`App started on ${port}`);
});