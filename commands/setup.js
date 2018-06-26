const async = require('async')
const { writeFileSync } = require('fs')
const readline = require('readline')
const stripFields = require('./../utils/strip-fields')
const getFile = require('../utils/get-file')

module.exports = setup

/**
 * Sets up widget configuration file
 *
 * @param  {[function]} api api client
 * @param  {[object]} config configuration file's data
 * @param  {[string]} region region to filter the configuration file
 * @param  {[object]} defaults default values used throughout the project
 */
function setup(region, defaults) {

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    let name,
        description,
        config = {},
        api,
        newRegion

    async.series(
    [       
            callback => {
                console.log(region, defaults.region);
                if(region !== defaults.region) {
                    console.log("here");
                    newRegion = region

                    config.region = newRegion

                    config[newRegion] = {
                        app_json: {
                            distribution: ['all']
                        },
                        widget_json: {
                            use_public_widget: true
                        }
                    }
                    
                    callback()
                } else {

                    rl.question(
                        `Which region do you want to use? (default one is ${defaults.region}) `,
                        function(input) {
    
                            newRegion = input.trim()
    
                            if(!input) {
    
                                newRegion = defaults.region
                            } else {
    
                                config['region'] = newRegion
                            }
    
                            config[newRegion] = {
                                app_json: {
                                    distribution: ['all']
                                },
                                widget_json: {
                                    use_public_widget: true
                                }
                            }
                            
                            callback()
                        }
                    )
                }
            },
            callback => {
                rl.question('App/Widget name: ', function(input) {
                    name = input
                    callback()
                })
            },
            callback => {
                rl.question('App/Widget description: ', function(input) {
                    description = input
                    callback()
                })
            }
        ],
        () => {

            const settings = getFile(defaults.settingsPath) 

            if (!settings) {
                console.error('No settings file found at', defaults.settingsPath)
                process.exit(1)
            }

            const credentials = require('../utils/credentials')(settings, newRegion)

            api = require('../api/api').bind({
                credentials: credentials,
                folder: defaults.folder,
                logger: this.logger
            })

            return Promise.resolve()
                .then(() => createApp(this.logger, api, name, description))
                .then(res => 
                    createWidget(this.logger, api, res, defaults.widget)
                )
                .then(res => 
                    createBucket(this.logger, api, res)
                )
                .then(res => createBucketEntry(this.logger, api, res))
                .then(res => uploadWidget(this.logger, api, res, defaults))
                .then(res => {
                    config[newRegion].app_json = res.app
                    config[newRegion].app_json.distribution = ['all']

                    config[newRegion].widget_json = stripFields(res.widget)
                    config[newRegion].widget_json.use_public_bucket = true

                    writeFileSync(
                        'config.json',
                        JSON.stringify(config, null, 4)
                    )
                })
                .catch(err => {
                    this.logger.error(err)
                    process.exit(1)
                })
                .then(() => rl.close())
        }
    )
}

function createApp(logger, api, name, description, distribution = ['all']) {

    const app = {
        name,
        description,
        distribution
    }

    return new Promise((resolve, reject) => {
        api('/api/apps', app)
            .then(res => {
                logger.info('Created app')
                logger.debug(res)
                resolve({ app: stripFields(res) })
            })
            .catch(err => reject(err))
    })
}

function createWidget(logger, api, settings, widgetDefaults) {

    const widget = Object.assign(
        {
            app_id: settings.app.id,
            description: settings.app.description,
            source: 'test',
            title: settings.app.name,
            type: 'marketplace',
            use_public_bucket: true
        },
        widgetDefaults
    )

    return new Promise((resolve, reject) => {
        api('/api/apps/widgets', widget)
            .then(res => {
                logger.debug(res)
                logger.info('Created widget')
                
                resolve({
                    app: settings.app,
                    widget: stripFields(res)
                })
            })
            .catch(err => {
                console.error(err)
                reject(err)
            })
    })
}

function createBucket(logger, api, settings) {

    console.info(settings)

    const bucket = {
        type: 'shared',
        acl: [
            {
                customer_id: '00000000-0000-0000-0000-000000000000',
                permission: 'ro'
            }
        ]
    }

    return new Promise((resolve, reject) => {
        api(`/api/storage/buckets/${settings.widget.id}`, bucket, 'put')
            .then(res => {
                logger.info('Created bucket')
                logger.debug(res)
                resolve({
                    app: settings.app,
                    widget: settings.widget
                })
            })
            .catch(err => reject(err))
    })
}

function createBucketEntry(logger, api, settings) {
    const bucket = {
        type: 'public'
    }

    return new Promise((resolve, reject) => {
        api(`/api/storage/buckets/${settings.widget.id}/entry`, bucket, 'put')
            .then(res => {
                logger.info('Created bucket entry')
                logger.debug(res)
                resolve({
                    app: settings.app,
                    widget: settings.widget
                })
            })
            .catch(err => reject(err))
    })
}

function uploadWidget(logger, api, settings, defaults) {
    let widgetSettings = Object.assign({}, settings.widget)

    // widget id should not be passed into the payload
    // due to error key 'id' is invalid to update
    delete widgetSettings.id

    const widget = Object.assign(defaults.widget, widgetSettings, {
        type: 'marketplace',
        // the bucket was created with using the widget's id as name
        source: `/cmp/api/storage/buckets/${settings.widget.id}/${
            defaults.entry
        }`
    })

    return new Promise((resolve, reject) =>
        api(`/api/apps/widgets/${settings.widget.id}`, widget, 'put')
            .then(res => {
                logger.info('Uploaded widget')
                logger.debug(res)

                resolve({
                    app: settings.app,
                    widget: Object.assign(
                        {
                            id: settings.widget.id,
                            source: widget.source
                        },
                        stripFields(res)
                    )
                })
            })
            .catch(err => reject(err))
    )
}
