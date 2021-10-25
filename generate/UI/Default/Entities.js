// Module import examples - none are required:
// import webRequest from 'UI/Functions/WebRequest';
// import Loop from 'UI/Loop';
// import { useSession } from 'UI/Session';
// import { useState, useEffect } from 'react'; 
// import Container from 'UI/Container';
// import Row from 'UI/Row';
// import Col from 'UI/Column';
// import myVectorImage from './filename.svg';
// import myRasterImage from './filename.jpg';
// import getRef from 'UI/Functions/GetRef'; 

export default function Entities(props) {
	// reference propTypes
	//const { title, size, width } = props;

	/* access session info, such as the currently logged-in user:
	const { session } = useSession();
	// session.user
	// session.locale
	*/

	/* runs only after component initialisation (comparable to legacy componentDidMount lifecycle method)
	useEffect(() => {
		// ...
	}, []);
	*/

	/* runs after both component initialisation and each update (comparable to legacy componentDidMount / componentDidUpdate lifecycle methods)
	useEffect(() => {
		// ...
	});
	*/

	/* to handle window events such as resize / scroll, etc:
	const [width, setWidth] = useState(window.innerWidth);
	useEffect(() => {
		const handleResize = () => setWidth(window.innerWidth);
		window.addEventListener('resize', handleResize);
		
		// optional return used to clean up
		return () => {
			window.removeEventListener('resize', handleResize);
		};
		
	});


	/* reference images in the same component folder:
	var vectorUrl = getRef(myVectorImage, { url: true });
	var rasterUrl = getRef(myRasterImage, { size: 128, url: true }); // where size represents the closest size required (see Api\ThirdParty\Uploader\UploaderConfig.cs for supported sizes)
	// omit size parameter to return original image resolution
	*/
	
	return (
		<div className="fully-qualified-entity">
			{/*<Container>
				<Row>
					<Col size={12}>
					</Col>
				</Row>
			</Container>
			*/}
		</div>
	);
}

/*
// propTypes are used to describe configuration on your component in the editor.
// Just setting it to an empty object will make your component appear as something that can be added.
// Define your available props like the examples below.

Entities.propTypes = {
	title: 'string', // text input
	size: [1,2,3,4], // dropdowns
	width: [ // dropdown with separate labels/values
		{ name: '1/12', value: 1 },
		{ name: '2/12', value: 2 },
		{ name: '3/12 (25%)', value: 3 },
		{ name: '4/12 (33%)', value: 4 },
		{ name: '5/12', value: 5 },
		{ name: '6/12 (50%)', value: 6 },
		{ name: '7/12', value: 7 },
		{ name: '8/12 (66%)', value: 8 },
		{ name: '9/12 (75%)', value: 9 },
		{ name: '10/12', value: 10 },
		{ name: '11/12', value: 11 },
		{ name: '12/12 (100%)', value: 12 }
	],

	// alternatively, specify property parameters on a more granular level
	scrolledBackgroundColor: {
        type: 'color',
        label: 'Background colour (when scrolled)', // optional replacement label
        help: 'Default background colour when page has been scrolled', // optional help text to be shown along with the field (default position is between the label and field)
        helpPosition: 'icon' // help text position can be set on a per-field basis by including helpPosition (above, below or icon - with icon, the help text is hidden as alt text on an info icon displayed alongside the field)
        placeholder: 'Select a colour' // by default, placeholder inherits the default value (if any) - set here to override this if necessary
    }	

	// All <Input type='x' /> values are supported - checkbox, color etc.
	// Also the special id type which can be used to select some other piece of content (by entity name), like this:
	templateToUse: {type: 'id', content: 'Template'}
};

// use defaultProps to define default values, if required
Entities.defaultProps = {
	title: "Example string",
	size: 1,
	width: 6	
}

// icon used to represent component when adding to a page via /en-admin/page
// see https://fontawesome.com/icons?d=gallery for available classnames
// NB: exclude the "fa-" prefix
Entities.icon='align-center'; // fontawesome icon
*/